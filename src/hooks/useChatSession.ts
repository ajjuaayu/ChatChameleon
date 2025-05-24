
// @ts-nocheck
// Disabling TypeScript checks for this file due to Firebase SDK dynamic nature and
// focus on core logic for this example. In a production app, ensure full type safety.
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, push, serverTimestamp, query, orderByChild, equalTo, limitToFirst, remove, onDisconnect, get, update, type DatabaseReference } from 'firebase/database';
import type { ChatMessage, ChatSession, ConnectionStatus } from '@/types';
import { getRandomName } from '@/lib/temporary-names';

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
  
  const [myAlias, setMyAlias] = useState<string | null>(null);
  const [partnerAlias, setPartnerAlias] = useState<string | null>(null);

  const unsubscribeSessionRef = useRef<(() => void) | null>(null);
  const unsubscribeMessagesRef = useRef<(() => void) | null>(null);
  const activeSessionDbRefForDisconnect = useRef<DatabaseReference | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userTypingRefForDisconnect = useRef<DatabaseReference | null>(null);
  const userAliasRefForConnect = useRef<string | null>(null);


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
    setMyAlias(null); // Reset alias
    setPartnerAlias(null); // Reset partner alias
    userAliasRefForConnect.current = null;
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

    const newGeneratedAlias = getRandomName();
    setMyAlias(newGeneratedAlias); // Set alias for immediate UI update
    userAliasRefForConnect.current = newGeneratedAlias;


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
            // Ensure not joining own session and session is truly waiting for user2
            if (session.user1Id !== userId && !session.user2Id && session.status === 'waiting') { 
              const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdKey}`);
              try {
                await update(sessionToUpdateRef, {
                  user2Id: userId,
                  user2Name: newGeneratedAlias, // Set user2's name
                  status: 'active',
                  updatedAt: serverTimestamp(),
                  typing_status: { [userId]: false, [session.user1Id]: false } 
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
          user1Name: newGeneratedAlias, // Set user1's name
          user2Id: null,
          status: 'waiting',
          messages: {},
          typing_status: { [userId]: false }, 
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
      setMyAlias(null); // Clear alias on error
    }
  }, [userId, isConnecting, resetState]);

  useEffect(() => {
    if (!currentSessionId || !userId) {
      // No active session or user, do nothing or ensure state is clean if needed
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
        setCurrentSessionId(null); 
        setChatPartnerId(null);
        setMessages([]);
        setIsPartnerTyping(false);
        setMyAlias(userAliasRefForConnect.current); // Keep locally generated alias if session disappears early
        setPartnerAlias(null);
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
        setMyAlias(null); 
        setPartnerAlias(null);
        return;
      }

      const partner = sessionData.user1Id === userId ? sessionData.user2Id : sessionData.user1Id;
      setChatPartnerId(partner);

      if (sessionData.user1Id === userId) {
        setMyAlias(sessionData.user1Name || userAliasRefForConnect.current || 'You');
        setPartnerAlias(sessionData.user2Name || (partner ? 'Stranger' : null));
      } else if (sessionData.user2Id === userId) {
        setMyAlias(sessionData.user2Name || userAliasRefForConnect.current || 'You');
        setPartnerAlias(sessionData.user1Name || (partner ? 'Stranger' : null));
      } else {
        // User is not part of this session, should not happen if logic is correct
        // Resetting might be too aggressive here, depends on desired behavior
      }


      if (sessionData.status === 'active' && partner) {
        setConnectionStatus('connected');
        const partnerTyping = sessionData.typing_status && partner ? !!sessionData.typing_status[partner] : false;
        setIsPartnerTyping(partnerTyping);
      } else if (sessionData.status === 'waiting' && sessionData.user1Id === userId) {
        setConnectionStatus('waiting');
        setIsPartnerTyping(false);
         setPartnerAlias(null); // No partner yet
      } else if (sessionData.status === 'active' && !partner) {
         console.warn("Session active but partner ID is missing. Reverting to waiting.");
         setConnectionStatus('waiting');
         setIsPartnerTyping(false);
         setPartnerAlias(null); 
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
  }, [currentSessionId, userId, connectionStatus]);


  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId || !userId || text.trim() === '' || connectionStatus !== 'connected') return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setMyTypingStatus(false); 

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
    
    if (sessionIdToDisconnect && userId) { 
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
        // Instead of remove, mark as closed to prevent immediate re-joining issue if one user disconnects
        // await update(sessionToDisconnectRef, { status: 'closed', updatedAt: serverTimestamp() });
        // Or just remove if ephemeral is strictly desired. Removing for simplicity now.
        await remove(sessionToDisconnectRef);
      } catch (err: any) {
        console.error("Error removing/closing session on disconnect: ", err);
      }
    }
  }, [currentSessionId, userId, resetState]);
  
  useEffect(() => {
    return () => {
      // General cleanup on unmount if hook is somehow destroyed while session is active.
      // resetState(); // This is now more specifically called.
    };
  }, []);


  return {
    userId,
    myAlias, // Added
    messages,
    connectionStatus,
    chatPartnerId,
    partnerAlias, // Added
    error,
    isPartnerTyping,
    connectToRandomUser,
    sendMessage,
    disconnect,
    handleUserTyping,
  };
}
