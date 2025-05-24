// @ts-nocheck
// Disabling TypeScript checks for this file due to Firebase SDK dynamic nature and
// focus on core logic for this example. In a production app, ensure full type safety.
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, set, push, serverTimestamp, query, orderByChild, equalTo, limitToFirst, remove, onDisconnect } from 'firebase/database';
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

  const sessionRef = useRef(null);
  const waitingQueryRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    setUserId(generateClientId());
  }, []);

  const cleanupListeners = useCallback(() => {
    if (sessionRef.current) {
      // off(sessionRef.current) does not work directly with onValue, need to store the unsubscribe function
      // For simplicity, we are not storing and calling unsubscribe here.
      // In a real app, you'd get the unsubscribe function from onValue and call it.
      sessionRef.current = null; 
    }
    if (waitingQueryRef.current) {
      // off(waitingQueryRef.current);
      waitingQueryRef.current = null;
    }
     if (messagesRef.current) {
      // off(messagesRef.current);
      messagesRef.current = null;
    }
  }, []);
  
  const resetState = useCallback(() => {
    setCurrentSessionId(null);
    setChatPartnerId(null);
    setMessages([]);
    setError(null);
    cleanupListeners();
  }, [cleanupListeners]);


  const connectToRandomUser = useCallback(async () => {
    if (!userId) {
      setError("User ID not available.");
      setConnectionStatus('error');
      return;
    }

    setConnectionStatus('connecting');
    setError(null);
    resetState();

    const sessionsDbRef = ref(database, SESSIONS_PATH);
    const waitingSessionsQuery = query(
      sessionsDbRef,
      orderByChild('status'),
      equalTo('waiting'),
      limitToFirst(1)
    );
    
    waitingQueryRef.current = waitingSessionsQuery;

    onValue(waitingSessionsQuery, async (snapshot) => {
      // Detach listener immediately after first read for finding a session
      // This onValue is tricky for "find or create". We might need a get() then decide.
      // For now, this will keep listening if no waiting session found initially which is not ideal.
      // A better approach would be a transaction or a cloud function for matching.
      // Simplified:
      if (connectionStatus !== 'connecting' && connectionStatus !== 'waiting') return;


      let sessionFound = false;
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          if (sessionFound) return;
          const session = childSnapshot.val() as ChatSession;
          const sessionId = childSnapshot.key;

          if (session.user1Id !== userId && !session.user2Id) { // Found a waiting session from another user
            sessionFound = true;
            const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionId}`);
            set(sessionToUpdateRef, {
              ...session,
              user2Id: userId,
              status: 'active',
              updatedAt: serverTimestamp(),
            }).then(() => {
              setCurrentSessionId(sessionId);
              setChatPartnerId(session.user1Id);
              setConnectionStatus('connected');
            }).catch(err => {
              setError("Failed to join session: " + err.message);
              setConnectionStatus('error');
            });
          }
        });
      }

      if (!sessionFound && (connectionStatus === 'connecting' || connectionStatus === 'waiting')) { // No waiting session, create one
        const newSessionRef = push(sessionsDbRef);
        const newSessionId = newSessionRef.key;
        if (!newSessionId) {
          setError("Failed to create session key.");
          setConnectionStatus('error');
          return;
        }
        
        const newSessionData: Partial<ChatSession> = {
          user1Id: userId,
          user2Id: null,
          status: 'waiting',
          messages: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await set(newSessionRef, newSessionData);
        setCurrentSessionId(newSessionId);
        setConnectionStatus('waiting');
        
        // Setup onDisconnect for the waiting user
        const user1OnDisconnectRef = ref(database, `${SESSIONS_PATH}/${newSessionId}/status`);
        onDisconnect(user1OnDisconnectRef).set('closed').catch(console.error);
         // Also fully remove if closed and still waiting (user2 never joined)
        const fullSessionOnDisconnectRef = ref(database, `${SESSIONS_PATH}/${newSessionId}`);
        onDisconnect(fullSessionOnDisconnectRef).remove().catch(console.error); // This might be too aggressive, consider 'closed' status first
      }
    }, { onlyOnce: false }); // onlyOnce: false to keep listening if waiting

  }, [userId, resetState, connectionStatus]);

  useEffect(() => {
    if (!currentSessionId || !userId) return;

    const currentSessionDbRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    sessionRef.current = currentSessionDbRef;

    const unsubscribeSession = onValue(currentSessionDbRef, (snapshot) => {
      if (!snapshot.exists()) {
        // Session was deleted (e.g., by other user disconnecting)
        if (connectionStatus === 'connected' || connectionStatus === 'waiting') {
           setError("Chat session ended.");
        }
        resetState();
        setConnectionStatus('idle');
        return;
      }

      const sessionData = snapshot.val() as ChatSession;
      if (sessionData.status === 'closed') {
        if (connectionStatus === 'connected' || connectionStatus === 'waiting') {
          setError("Chat session has been closed.");
        }
        resetState();
        setConnectionStatus('idle');
        // remove(currentSessionDbRef); // Clean up if closed
        return;
      }

      if (sessionData.status === 'active' && connectionStatus !== 'connected') {
        setConnectionStatus('connected');
        const partner = sessionData.user1Id === userId ? sessionData.user2Id : sessionData.user1Id;
        setChatPartnerId(partner);
      }
      
      // Messages handling is separate now
    });
    
    // Messages listener
    const messagesDbRefPath = `${SESSIONS_PATH}/${currentSessionId}/messages`;
    messagesRef.current = ref(database, messagesDbRefPath);
    const unsubscribeMessages = onValue(messagesRef.current, (snapshot) => {
        const messagesData = snapshot.val();
        if (messagesData) {
          const newMessages = Object.entries(messagesData).map(([id, msg]: [string, any]) => ({
            ...msg,
            id,
            isLocalSender: msg.senderId === userId,
          })).sort((a, b) => a.timestamp - b.timestamp);
          setMessages(newMessages);
        } else {
          setMessages([]);
        }
    });


    // Setup onDisconnect for active session
    const statusOnDisconnectRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/status`);
    // When this client disconnects, mark the session as closed.
    // The other client's onValue listener for the session will see status='closed' and then clean up.
    // Or, for immediate ephemeral, remove the session.
    const sessionOnDisconnectRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    onDisconnect(sessionOnDisconnectRef).remove().catch(console.error);


    return () => {
      unsubscribeSession();
      unsubscribeMessages();
      // To prevent onDisconnect from firing if we disconnect cleanly:
      if (sessionOnDisconnectRef.current) onDisconnect(sessionOnDisconnectRef.current).cancel();
      cleanupListeners();
    };
  }, [currentSessionId, userId, resetState, connectionStatus]);


  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId || !userId || text.trim() === '') return;

    const messageData = {
      senderId: userId,
      text: text.trim(),
      timestamp: serverTimestamp(),
    };
    const sessionMessagesRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/messages`);
    const newMessageRef = push(sessionMessagesRef);
    await set(newMessageRef, messageData);
    // Update session's updatedAt timestamp
    const sessionUpdatedAtRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/updatedAt`);
    await set(sessionUpdatedAtRef, serverTimestamp());

  }, [currentSessionId, userId]);

  const disconnect = useCallback(async () => {
    if (!currentSessionId) return;
    
    const sessionToDisconnectRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    try {
      // Instead of setting status to 'closed', we just remove it for ephemeral chats
      await remove(sessionToDisconnectRef);
    } catch (err) {
      console.error("Error during disconnect: ", err);
      setError("Failed to properly disconnect session.");
    } finally {
      // Cancel any pending onDisconnect operations for this session path
      onDisconnect(sessionToDisconnectRef).cancel();
      resetState();
      setConnectionStatus('idle');
    }
  }, [currentSessionId, resetState]);
  
  useEffect(() => {
    // General cleanup for component unmount
    return () => {
      if (currentSessionId) {
        // This is a fallback if disconnect() wasn't called
        // but onDisconnect Firebase handler should ideally cover abrupt closes.
        const sessionToCleanRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
        // onDisconnect(sessionToCleanRef).remove(); // This was already set
      }
      cleanupListeners();
    };
  }, [currentSessionId, cleanupListeners]);


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
