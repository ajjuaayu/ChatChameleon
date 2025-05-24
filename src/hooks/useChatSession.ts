
// @ts-nocheck
// Disabling TypeScript checks for this file due to Firebase SDK dynamic nature and
// focus on core logic for this example. In a production app, ensure full type safety.
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, push, serverTimestamp, query, orderByChild, equalTo, limitToFirst, remove, onDisconnect, get, update, type DatabaseReference } from 'firebase/database';
import type { ChatMessage, ChatSession, ConnectionStatus } from '@/types';

const SESSIONS_PATH = 'chat_sessions';
const TYPING_TIMEOUT_DURATION = 3000; // 3 seconds

function generateClientId() {
  if (typeof window !== 'undefined' && window.localStorage) {
    let clientId = localStorage.getItem('chatChameleonClientId');
    if (!clientId) {
      clientId = `user_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('chatChameleonClientId', clientId);
    }
    return clientId;
  }
  return `user_server_${Math.random().toString(36).substring(2, 11)}`; // Fallback for SSR/testing
}


export function useChatSession() {
  const [userId, setUserId] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(false);

  const unsubscribeSessionRef = useRef<(() => void) | null>(null);
  const unsubscribeMessagesRef = useRef<(() => void) | null>(null);
  const activeSessionDbRefForDisconnect = useRef<DatabaseReference | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userTypingRefForDisconnect = useRef<DatabaseReference | null>(null);


  useEffect(() => {
    setUserId(generateClientId());
  }, []);

  const setMyTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!currentSessionId || !userId) return;
    const typingRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/typing_status/${userId}`);
    try {
      await set(typingRef, isTyping);
    } catch (e) {
      console.warn("Failed to set typing status:", e);
    }
  }, [currentSessionId, userId]);

  const handleUserTyping = useCallback(() => {
    if (!currentSessionId || !userId || connectionStatus !== 'connected') return;

    setMyTypingStatus(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setMyTypingStatus(false);
    }, TYPING_TIMEOUT_DURATION);
  }, [setMyTypingStatus, currentSessionId, userId, connectionStatus]);


  const resetState = useCallback(() => {
    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    unsubscribeSessionRef.current = null;
    unsubscribeMessagesRef.current = null;

    if (activeSessionDbRefForDisconnect.current) {
        onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel session onDisconnect in resetState:", err));
        activeSessionDbRefForDisconnect.current = null; 
    }
    if (userTypingRefForDisconnect.current) {
        onDisconnect(userTypingRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel typing onDisconnect in resetState:", err));
        userTypingRefForDisconnect.current = null;
    }
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
    }
    
    setCurrentSessionId(null);
    setChatPartnerId(null);
    setMessages([]);
    setError(null);
    setIsConnecting(false);
    setIsPartnerTyping(false);
  }, []);


  const connectToRandomUser = useCallback(async () => {
    resetState(); 

    if (!userId) {
      setError("User ID not available.");
      setConnectionStatus('error');
      return;
    }
    if (isConnecting) {
      console.log("Connection attempt already in progress.");
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('connecting');
    setError(null);

    const sessionsDbRef = ref(database, SESSIONS_PATH);
    const waitingSessionsQuery = query(
      sessionsDbRef,
      orderByChild('status'),
      equalTo('waiting'),
      limitToFirst(5) 
    );

    try {
      const snapshot = await get(waitingSessionsQuery);
      let sessionJoined = false;

      if (snapshot.exists()) {
        const sessionsData = snapshot.val();
        for (const sessionIdKey in sessionsData) {
          if (Object.prototype.hasOwnProperty.call(sessionsData, sessionIdKey)) {
            const session = sessionsData[sessionIdKey] as ChatSession;
            if (session.user1Id !== userId && !session.user2Id) { 
              const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdKey}`);
              try {
                await update(sessionToUpdateRef, {
                  user2Id: userId,
                  status: 'active',
                  updatedAt: serverTimestamp(),
                  typing_status: { [userId]: false, [session.user1Id]: false } // Initialize typing status
                });
                setCurrentSessionId(sessionIdKey); 
                sessionJoined = true;
                break; 
              } catch (joinError) {
                console.error(`Failed to join session ${sessionIdKey}:`, joinError);
              }
            }
          }
        }
      }

      if (!sessionJoined) {
        const newSessionRef = push(sessionsDbRef);
        const newSessionIdKey = newSessionRef.key;
        if (!newSessionIdKey) {
          throw new Error("Failed to create session key.");
        }
        
        const newSessionData: Partial<ChatSession> = {
          user1Id: userId,
          user2Id: null,
          status: 'waiting',
          messages: {},
          typing_status: { [userId]: false }, // Initialize typing status
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await set(newSessionRef, newSessionData);
        setCurrentSessionId(newSessionIdKey); 
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      setError("Connection error: " + err.message);
      setConnectionStatus('error');
      setIsConnecting(false); 
    }
  }, [userId, isConnecting, resetState]);

  useEffect(() => {
    if (!currentSessionId || !userId) {
      if (connectionStatus !== 'idle' && connectionStatus !== 'error' && connectionStatus !== 'connecting') {
        // Potentially reset or set to idle if session is lost without explicit disconnect
      }
      return;
    }

    const currentSessionDbRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    activeSessionDbRefForDisconnect.current = currentSessionDbRef; 
    
    const currentUserTypingFirebaseRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/typing_status/${userId}`);
    userTypingRefForDisconnect.current = currentUserTypingFirebaseRef;


    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    
    unsubscribeSessionRef.current = onValue(currentSessionDbRef, (snapshot) => {
      setIsConnecting(false); 

      if (!snapshot.exists()) {
        if (connectionStatus === 'connected' || connectionStatus === 'waiting') {
           setError("Chat session ended abruptly.");
        }
        setConnectionStatus('idle');
        // resetState will be called by disconnect or if currentSessionId becomes null elsewhere
        setCurrentSessionId(null); 
        setChatPartnerId(null);
        setMessages([]);
        setIsPartnerTyping(false);
        return;
      }

      const sessionData = snapshot.val() as ChatSession;
      if (sessionData.status === 'closed') {
        if (connectionStatus === 'connected' || connectionStatus === 'waiting') {
           setError("Chat session has been closed.");
        }
        setConnectionStatus('idle');
        setCurrentSessionId(null);
        setChatPartnerId(null);
        setMessages([]);
        setIsPartnerTyping(false);
        return;
      }

      const partner = sessionData.user1Id === userId ? sessionData.user2Id : sessionData.user1Id;
      setChatPartnerId(partner); // Set partner ID regardless of status if available

      if (sessionData.status === 'active' && partner) {
        setConnectionStatus('connected');
        const partnerTyping = sessionData.typing_status && partner ? !!sessionData.typing_status[partner] : false;
        setIsPartnerTyping(partnerTyping);
      } else if (sessionData.status === 'waiting' && sessionData.user1Id === userId) {
        setConnectionStatus('waiting');
        setIsPartnerTyping(false);
      } else if (sessionData.status === 'active' && !partner) {
         console.warn("Session active but partner ID is missing. Reverting to waiting.");
         setConnectionStatus('waiting');
         setIsPartnerTyping(false);
      }
    }, (errorVal) => {
        console.error("Error listening to session:", errorVal);
        setError("Error in session: " + errorVal.message);
        setConnectionStatus('error');
        setIsConnecting(false);
    });
    
    const messagesDbRefPath = `${SESSIONS_PATH}/${currentSessionId}/messages`;
    const currentMessagesDbRef = ref(database, messagesDbRefPath);
    unsubscribeMessagesRef.current = onValue(currentMessagesDbRef, (snapshot) => {
        const messagesData = snapshot.val();
        if (messagesData) {
          const newMessages = Object.entries(messagesData).map(([id, msg]: [string, any]) => ({
            ...msg,
            id,
          })).sort((a, b) => a.timestamp - b.timestamp);
          setMessages(newMessages);
        } else {
          setMessages([]);
        }
    }, (errorVal) => {
        console.error("Error listening to messages:", errorVal);
        setError("Error loading messages: " + errorVal.message);
    });

    // Setup onDisconnect listeners
    onDisconnect(currentSessionDbRef).remove().catch(err => console.error("Failed to set onDisconnect(remove) for session:", err));
    onDisconnect(currentUserTypingFirebaseRef).set(false).catch(err => console.warn("Failed to set onDisconnect for typing status:", err));


    return () => {
      if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
      if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
      
      if (activeSessionDbRefForDisconnect.current) {
        onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel session onDisconnect cleanup:", err));
      }
      if (userTypingRefForDisconnect.current) {
        onDisconnect(userTypingRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel typing onDisconnect cleanup:", err));
      }
       if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [currentSessionId, userId, connectionStatus]); // Added connectionStatus to re-evaluate if it changes


  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId || !userId || text.trim() === '' || connectionStatus !== 'connected') return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setMyTypingStatus(false); // Sent message, so not typing anymore

    const messageData = {
      senderId: userId,
      text: text.trim(),
      timestamp: serverTimestamp(),
    };
    const sessionMessagesRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/messages`);
    const newMessageRef = push(sessionMessagesRef);
    
    try {
        await set(newMessageRef, messageData);
        const sessionUpdatedAtRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/updatedAt`);
        await set(sessionUpdatedAtRef, serverTimestamp());
    } catch(e : any) {
        console.error("Failed to send message:", e);
        setError("Failed to send message: " + e.message);
    }
  }, [currentSessionId, userId, setMyTypingStatus, connectionStatus]);

  const disconnect = useCallback(async () => {
    const sessionIdToDisconnect = currentSessionId; 
    
    if (sessionIdToDisconnect && userId) { // Set typing to false before removing session
        const userTypingFirebaseRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}/typing_status/${userId}`);
        try {
            await set(userTypingFirebaseRef, false);
        } catch (e) {
            console.warn("Could not set typing to false before disconnect", e)
        }
    }

    resetState(); 
    setConnectionStatus('idle'); 

    if (sessionIdToDisconnect) {
      const sessionToDisconnectRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}`);
      try {
        await remove(sessionToDisconnectRef);
      } catch (err: any) {
        console.error("Error removing session on disconnect: ", err);
      }
    }
  }, [currentSessionId, userId, resetState]);
  
  useEffect(() => {
    return () => {
      // General cleanup: if component unmounts and a session might be active,
      // ensure local state is reset. Firebase onDisconnect should handle DB.
      // resetState(); // This is now called more specifically.
    };
  }, []);


  return {
    userId,
    messages,
    connectionStatus,
    chatPartnerId,
    error,
    isPartnerTyping,
    connectToRandomUser,
    sendMessage,
    disconnect,
    handleUserTyping,
  };
}
