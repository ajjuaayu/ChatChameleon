
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
  const userTypingRefForDisconnect = useRef<DatabaseReference | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userAliasRefForConnect = useRef<string | null>(null);


  useEffect(() => {
    setUserId(generateClientId());
  }, []);

  const setMyTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!currentSessionId || !userId || connectionStatus !== 'connected') return;
    const typingRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/typing_status/${userId}`);
    try {
      await set(typingRef, isTyping);
    } catch (e) {
      console.warn("Failed to set typing status:", e);
    }
  }, [currentSessionId, userId, connectionStatus]);

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


  const resetState = useCallback((isLeavingPartnerLeftState = false) => {
    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    unsubscribeSessionRef.current = null;
    unsubscribeMessagesRef.current = null;

    // Only cancel Firebase onDisconnect if not already in 'partner_left' state,
    // or if explicitly told to (e.g., when fully cleaning up after partner_left).
    // When partner_left, we might have already cancelled it or don't want to interfere
    // with the session record that indicates the partner left.
    if (activeSessionDbRefForDisconnect.current && (!isLeavingPartnerLeftState || connectionStatus !== 'partner_left')) {
        onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel session onDisconnect in resetState:", err));
    }
    activeSessionDbRefForDisconnect.current = null; 
    
    if (userTypingRefForDisconnect.current && (!isLeavingPartnerLeftState || connectionStatus !== 'partner_left')) {
        onDisconnect(userTypingRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel typing onDisconnect in resetState:", err));
    }
    userTypingRefForDisconnect.current = null;

    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
    }
    
    setCurrentSessionId(null);
    setChatPartnerId(null);
    setMessages([]);
    // setError(null); // Don't clear error if we want to display a disconnect message, handled by caller
    setIsConnecting(false);
    setIsPartnerTyping(false);
    setMyAlias(null); 
    setPartnerAlias(null); 
    userAliasRefForConnect.current = null;
  }, [connectionStatus]);


  const connectToRandomUser = useCallback(async () => {
    resetState(); 
    setError(null);

    if (!userId) {
      setError("User ID not available. Please refresh.");
      setConnectionStatus('error');
      return;
    }
    if (isConnecting) {
      console.log("Connection attempt already in progress.");
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('connecting');
    
    const newGeneratedAlias = getRandomName();
    setMyAlias(newGeneratedAlias); 
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
            if (session.user1Id !== userId && !session.user2Id && session.status === 'waiting') { 
              const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdKey}`);
              try {
                await update(sessionToUpdateRef, {
                  user2Id: userId,
                  user2Name: newGeneratedAlias, 
                  status: 'active',
                  updatedAt: serverTimestamp(),
                  typing_status: { [userId]: false, [session.user1Id]: false },
                  closedBy: null,
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
          user1Name: newGeneratedAlias, 
          user2Id: null,
          status: 'waiting',
          messages: {},
          typing_status: { [userId]: false }, 
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          closedBy: null,
        };

        await set(newSessionRef, newSessionData);
        setCurrentSessionId(newSessionIdKey); 
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      setError("Connection error: " + err.message);
      setConnectionStatus('error');
      setIsConnecting(false); 
      setMyAlias(null); 
    }
  }, [userId, isConnecting, resetState]);

  useEffect(() => {
    if (!currentSessionId || !userId) {
      if (connectionStatus !== 'partner_left' && connectionStatus !== 'error') {
         setConnectionStatus('idle');
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
        // This means the session was explicitly removed by the other user after they saw their partner left, or by this client.
        if (connectionStatus !== 'idle' && connectionStatus !== 'partner_left') { // Avoid error if already handled or idle
            setError("Chat session has ended.");
            setConnectionStatus('error');
        }
        // resetState might be called by the function that led to removal, or here if it's unexpected.
        if (currentSessionId) setCurrentSessionId(null); 
        setChatPartnerId(null);
        setMessages([]);
        setPartnerAlias(null);
        return;
      }

      const sessionData = snapshot.val() as ChatSession;
      
      // Determine partner and aliases early
      const currentPartnerId = sessionData.user1Id === userId ? sessionData.user2Id : sessionData.user1Id;
      setChatPartnerId(currentPartnerId);

      if (sessionData.user1Id === userId) {
        setMyAlias(sessionData.user1Name || userAliasRefForConnect.current || 'You');
        setPartnerAlias(sessionData.user2Name || (currentPartnerId ? 'Stranger' : null));
      } else if (sessionData.user2Id === userId) {
        setMyAlias(sessionData.user2Name || userAliasRefForConnect.current || 'You');
        setPartnerAlias(sessionData.user1Name || (currentPartnerId ? 'Stranger' : null));
      }
      
      if (sessionData.status === 'closed') {
        if (sessionData.closedBy && sessionData.closedBy !== userId) {
          setError( (partnerAlias || 'Your partner') + " has left the chat.");
          setConnectionStatus('partner_left');
          // Cancel our own onDisconnect that would mark as closed, as it's already closed by partner
          if (activeSessionDbRefForDisconnect.current) {
            onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(e => console.warn("Failed to cancel session onDisconnect for partner_left state", e));
          }
          if (userTypingRefForDisconnect.current) {
             onDisconnect(userTypingRefForDisconnect.current).cancel().catch(e => console.warn("Failed to cancel typing onDisconnect for partner_left state", e));
          }
        } else if (sessionData.closedBy === userId && connectionStatus !== 'idle') {
          // I closed it, and I'm not yet idle. Transition to idle.
          // This happens if `disconnect()` was called.
          // `disconnect()` will call `resetState` and set `idle` status itself.
          // So this path is a fallback or confirmation.
          // If disconnect() is working correctly, this specific branch might not be strictly needed
          // as `disconnect()` handles its own transition.
        } else if (!sessionData.closedBy && connectionStatus !== 'idle') { // Generic close or unexpected
          setError("Chat session has been closed.");
          setConnectionStatus('error');
          setCurrentSessionId(null);
        }
        // Messages are kept for display in 'partner_left' state until user explicitly leaves.
        // Typing status for partner is no longer relevant.
        setIsPartnerTyping(false);
        return; // Important: stop further processing if closed
      }


      if (sessionData.status === 'active' && currentPartnerId) {
        setConnectionStatus('connected');
        setError(null); 
        const partnerTyping = sessionData.typing_status && currentPartnerId ? !!sessionData.typing_status[currentPartnerId] : false;
        setIsPartnerTyping(partnerTyping);
      } else if (sessionData.status === 'waiting' && sessionData.user1Id === userId) {
        setConnectionStatus('waiting');
        setIsPartnerTyping(false);
        setPartnerAlias(null); 
      } else if (sessionData.status === 'active' && !currentPartnerId) {
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
        setCurrentSessionId(null);
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

    // If this client disconnects abruptly, Firebase updates session status
    onDisconnect(currentSessionDbRef).update({ status: 'closed', closedBy: userId, updatedAt: serverTimestamp() })
      .catch(err => console.error("Failed to set onDisconnect(update) for session:", err));
    onDisconnect(currentUserTypingFirebaseRef).set(false)
      .catch(err => console.warn("Failed to set onDisconnect for typing status:", err));

    return () => {
      if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
      if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
      unsubscribeSessionRef.current = null;
      unsubscribeMessagesRef.current = null;
      
      // Only cancel Firebase onDisconnect if not in 'partner_left' state,
      // as it might have been cancelled already, or we want the update to fire if this cleanup is due to tab close.
      if (connectionStatus !== 'partner_left') {
        if (activeSessionDbRefForDisconnect.current) {
          onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel session onDisconnect cleanup:", err));
        }
        if (userTypingRefForDisconnect.current) {
          onDisconnect(userTypingRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel typing onDisconnect cleanup:", err));
        }
      }
      activeSessionDbRefForDisconnect.current = null;
      userTypingRefForDisconnect.current = null;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [currentSessionId, userId, connectionStatus, partnerAlias]); // partnerAlias added to re-evaluate error message if it changes


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
        const sessionRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
        await update(sessionRef, { updatedAt: serverTimestamp(), closedBy: null }); // Clear closedBy if chat resumes
    } catch(e : any) {
        console.error("Failed to send message:", e);
        setError("Failed to send message: " + e.message);
    }
  }, [currentSessionId, userId, setMyTypingStatus, connectionStatus]);

  const disconnect = useCallback(async (isFinalCleanup = false) => {
    const sessionIdToDisconnect = currentSessionId;
    
    if (sessionIdToDisconnect && userId) { 
        const userTypingFirebaseRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}/typing_status/${userId}`);
        try {
            await set(userTypingFirebaseRef, false); 
        } catch (e) {
            console.warn("Could not set typing to false before disconnect", e);
        }
        if (userTypingRefForDisconnect.current) {
            onDisconnect(userTypingRefForDisconnect.current).cancel().catch(e => console.warn("Failed to cancel typing onDisconnect during explicit disconnect", e));
        }

        const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}`);
        try {
          if (!isFinalCleanup) { // Normal disconnect: mark as closed
            await update(sessionToUpdateRef, { 
              status: 'closed', 
              closedBy: userId, 
              updatedAt: serverTimestamp() 
            });
          } else { // Final cleanup: remove the session
             await remove(sessionToUpdateRef);
          }
          if (activeSessionDbRefForDisconnect.current) {
            onDisconnect(activeSessionDbRefForDisconnect.current).cancel().catch(err => console.warn("Failed to cancel session onDisconnect after manual update/removal:", err));
          }
        } catch (err: any) {
          console.error("Error updating/removing session on explicit disconnect: ", err);
        }
    }
    
    resetState(isFinalCleanup && connectionStatus === 'partner_left'); 
    setConnectionStatus('idle'); 
    setError(null);
  }, [currentSessionId, userId, resetState, connectionStatus]);

  const leaveClosedChatAndGoIdle = useCallback(async () => {
    if (currentSessionId) {
      const sessionRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
      try {
        await remove(sessionRef); // Final removal of the session
      } catch (e) {
        console.error("Error removing session in leaveClosedChatAndGoIdle:", e);
      }
    }
    resetState(true); // Pass true to indicate we are leaving the partner_left state
    setConnectionStatus('idle');
    setError(null);
  }, [currentSessionId, resetState]);
  
  return {
    userId,
    myAlias, 
    messages,
    connectionStatus,
    chatPartnerId,
    partnerAlias, 
    error,
    isPartnerTyping,
    connectToRandomUser,
    sendMessage,
    disconnect, // This is the user clicking "Disconnect" from an active chat
    handleUserTyping,
    leaveClosedChatAndGoIdle, // This is for leaving after partner has already left
  };
}
