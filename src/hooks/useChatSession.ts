// @ts-nocheck
// Disabling TypeScript checks for this file due to Firebase SDK dynamic nature and
// focus on core logic for this example. In a production app, ensure full type safety.
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, push, serverTimestamp, query, orderByChild, equalTo, limitToFirst, remove, onDisconnect, get, update, type DatabaseReference } from 'firebase/database';
import type { ChatMessage, ChatSession, ConnectionStatus } from '@/types';

const SESSIONS_PATH = 'chat_sessions';

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

  // Store unsubscribe functions in refs
  const unsubscribeSessionRef = useRef<(() => void) | null>(null);
  const unsubscribeMessagesRef = useRef<(() => void) | null>(null);
  const activeSessionDbRefForDisconnect = useRef<DatabaseReference | null>(null);


  useEffect(() => {
    setUserId(generateClientId());
  }, []);

  const resetState = useCallback(() => {
    // Detach listeners first
    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    unsubscribeSessionRef.current = null;
    unsubscribeMessagesRef.current = null;

    // Cancel onDisconnect for the *previous* session if it exists
    if (activeSessionDbRefForDisconnect.current) {
        onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel onDisconnect in resetState:", err));
        activeSessionDbRefForDisconnect.current = null; 
    }
    
    setCurrentSessionId(null);
    setChatPartnerId(null);
    setMessages([]);
    setError(null);
    setIsConnecting(false); // Ensure connecting flag is reset
    // setConnectionStatus('idle'); // Will be set by disconnect or successful connection end
  }, []);


  const connectToRandomUser = useCallback(async () => {
    resetState(); // Reset state from any previous session first

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
      limitToFirst(5) // Query a few to increase chances of finding one quickly
    );

    try {
      const snapshot = await get(waitingSessionsQuery);
      let sessionJoined = false;

      if (snapshot.exists()) {
        const sessionsData = snapshot.val();
        for (const sessionIdKey in sessionsData) {
          if (Object.prototype.hasOwnProperty.call(sessionsData, sessionIdKey)) {
            const session = sessionsData[sessionIdKey] as ChatSession;
            if (session.user1Id !== userId && !session.user2Id) { // Found a waiting session from another user
              const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdKey}`);
              try {
                await update(sessionToUpdateRef, {
                  user2Id: userId,
                  status: 'active',
                  updatedAt: serverTimestamp(),
                });
                setCurrentSessionId(sessionIdKey); // This will trigger the main useEffect
                sessionJoined = true;
                break; 
              } catch (joinError) {
                console.error(`Failed to join session ${sessionIdKey}:`, joinError);
                // Continue to try other waiting sessions or create a new one
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
          messages: {}, // Initialize messages
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await set(newSessionRef, newSessionData);
        setCurrentSessionId(newSessionIdKey); // This will trigger the main useEffect
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      setError("Connection error: " + err.message);
      setConnectionStatus('error');
      setIsConnecting(false); 
    }
    // setIsConnecting will be set to false by the main useEffect once status is connected/waiting, or if error occurred
  }, [userId, isConnecting, resetState]);

  useEffect(() => {
    if (!currentSessionId || !userId) {
      // If there's no current session, ensure we are in a clean idle state if not already error.
      if (connectionStatus !== 'idle' && connectionStatus !== 'error' && connectionStatus !== 'connecting') {
        // setConnectionStatus('idle'); // Avoid infinite loop if resetState also sets to idle.
        // resetState(); // This might be too broad here. Disconnect should handle full reset.
      }
      return;
    }

    const currentSessionDbRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    activeSessionDbRefForDisconnect.current = currentSessionDbRef; 

    // Clear previous listeners before attaching new ones
    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    
    unsubscribeSessionRef.current = onValue(currentSessionDbRef, (snapshot) => {
      setIsConnecting(false); // Connection process is resolved (either found, waiting, or failed by deletion)

      if (!snapshot.exists()) {
        if (connectionStatus === 'connected' || connectionStatus === 'waiting') {
           setError("Chat session ended abruptly.");
        }
        setConnectionStatus('idle');
        setCurrentSessionId(null); 
        setChatPartnerId(null);
        setMessages([]);
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
        // remove(currentSessionDbRef).catch(e => console.warn("Could not remove closed session:", e));
        return;
      }

      if (sessionData.status === 'active') {
        const partner = sessionData.user1Id === userId ? sessionData.user2Id : sessionData.user1Id;
        if (partner) {
            setChatPartnerId(partner);
            setConnectionStatus('connected');
        } else {
            console.warn("Session active but partner ID is missing. Reverting to waiting.");
            setConnectionStatus('waiting');
        }
      } else if (sessionData.status === 'waiting') {
        // Ensure this client is indeed user1 if status is waiting.
        // If this client is user2, status should be active.
        if(sessionData.user1Id === userId){
            setConnectionStatus('waiting');
            setChatPartnerId(null);
        } else if (sessionData.user2Id === userId) {
            // This should ideally not happen: status waiting but user2Id is this user.
            // Session should have been 'active'. Potentially a race condition.
            console.warn("Session status is 'waiting' but this client is user2. Treating as 'active'.");
            setChatPartnerId(sessionData.user1Id);
            setConnectionStatus('connected');
        }
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

    return () => {
      if (unsubscribeSessionRef.current) {
        unsubscribeSessionRef.current();
        unsubscribeSessionRef.current = null;
      }
      if (unsubscribeMessagesRef.current) {
        unsubscribeMessagesRef.current();
        unsubscribeMessagesRef.current = null;
      }
      if (activeSessionDbRefForDisconnect.current) {
        onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel onDisconnect(remove) for session:", err));
        activeSessionDbRefForDisconnect.current = null;
      }
    };
  }, [currentSessionId, userId]); // Removed connectionStatus from deps


  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId || !userId || text.trim() === '') return;

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
  }, [currentSessionId, userId]);

  const disconnect = useCallback(async () => {
    const sessionIdToDisconnect = currentSessionId; 
    
    resetState(); // Clears currentSessionId, listeners, and onDisconnect for that session
    setConnectionStatus('idle'); 

    if (sessionIdToDisconnect) {
      const sessionToDisconnectRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}`);
      try {
        await remove(sessionToDisconnectRef);
      } catch (err: any) {
        console.error("Error removing session on disconnect: ", err);
        // Don't set error here as resetState already cleared it.
        // setError("Failed to properly remove session from database.");
      }
    }
  }, [currentSessionId, resetState]);
  
  // General cleanup for component unmount
  useEffect(() => {
    return () => {
      // This will call resetState if the component is unmounted.
      // If a session was active, onDisconnect().remove() should handle DB cleanup for abrupt closes.
      // For explicit unmounts (e.g. navigating away), disconnect() should be called by the component.
      // resetState(); // This might be too aggressive if disconnect() is the preferred way.
      // Let's rely on the specific useEffect cleanup for currentSessionId.
    };
  }, [resetState]);


  return {
    userId,
    messages,
    connectionStatus,
    chatPartnerId,
    error,
    connectToRandomUser,
    sendMessage,
    disconnect,
  };
}
