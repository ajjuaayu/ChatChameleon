
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
  return `user_server_${Math.random().toString(36).substring(2, 11)}`;
}


export function useChatSession() {
  const [userId, setUserId] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false); // Tracks if connectToRandomUser is in progress
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(false);
  
  const [myAlias, setMyAlias] = useState<string | null>(null);
  const [partnerAlias, setPartnerAlias] = useState<string | null>(null);

  const unsubscribeSessionRef = useRef<(() => void) | null>(null);
  const unsubscribeMessagesRef = useRef<(() => void) | null>(null);
  const activeSessionDbRefForDisconnect = useRef<DatabaseReference | null>(null);
  const userTypingRefForDisconnect = useRef<DatabaseReference | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userAliasRefForConnect = useRef<string | null>(null); // Stores alias during connection attempt


  useEffect(() => {
    setUserId(generateClientId());
  }, []);

  const cancelAllFirebaseOnDisconnects = useCallback(async () => {
    if (activeSessionDbRefForDisconnect.current) {
      try {
        await onDisconnect(activeSessionDbRefForDisconnect.current).cancel();
      } catch (e) { console.warn("Failed to cancel session onDisconnect:", e); }
      activeSessionDbRefForDisconnect.current = null;
    }
    if (userTypingRefForDisconnect.current) {
      try {
        await onDisconnect(userTypingRefForDisconnect.current).cancel();
      } catch (e) { console.warn("Failed to cancel typing onDisconnect:", e); }
      userTypingRefForDisconnect.current = null;
    }
  }, []);

  const resetState = useCallback((options: { clearError?: boolean, newStatus?: ConnectionStatus } = {}) => {
    const { clearError = true, newStatus = 'idle' } = options;

    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
    unsubscribeSessionRef.current = null;
    unsubscribeMessagesRef.current = null;

    // Cancel onDisconnects. It's generally safe to call cancel even if not set or already cancelled.
    // This is called when we are definitively done with the session or starting fresh.
    cancelAllFirebaseOnDisconnects();
    
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
    }
    
    setCurrentSessionId(null);
    setChatPartnerId(null);
    setMessages([]);
    if (clearError) setError(null);
    setIsConnecting(false); // Ensure isConnecting is reset
    setIsPartnerTyping(false);
    
    // Only reset alias if truly starting over, not just if partner left.
    // Alias is typically set before connection attempt.
    if (newStatus === 'idle' && connectionStatus !== 'partner_left') {
      setMyAlias(null); 
      userAliasRefForConnect.current = null;
    }
    setPartnerAlias(null); 
    setConnectionStatus(newStatus);

  }, [cancelAllFirebaseOnDisconnects, connectionStatus]);


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
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setMyTypingStatus(false);
    }, TYPING_TIMEOUT_DURATION);
  }, [setMyTypingStatus, currentSessionId, userId, connectionStatus]);

  const connectToRandomUser = useCallback(async () => {
    if (isConnecting) return; // Already trying to connect

    resetState({ newStatus: 'connecting' }); // Reset fully before starting
    setIsConnecting(true);

    if (!userId) {
      setError("User ID not available. Please refresh.");
      resetState({ newStatus: 'error', clearError: false });
      return;
    }
    
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
                // isConnecting will be set to false by the useEffect when session data is received
                break; 
              } catch (joinError) {
                console.warn(`Failed to join session ${sessionIdKey}:`, joinError);
                // Continue to try other sessions or create new
              }
            }
          }
        }
      }

      if (!sessionJoined) {
        const newSessionRef = push(sessionsDbRef);
        const newSessionIdKey = newSessionRef.key;
        if (!newSessionIdKey) throw new Error("Failed to create session key.");
        
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
        // isConnecting will be set to false by the useEffect
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      setError("Connection error: " + err.message);
      resetState({ newStatus: 'error', clearError: false });
      setMyAlias(null);
    }
  }, [userId, isConnecting, resetState]);


  useEffect(() => {
    if (!currentSessionId || !userId) {
      // If no session ID, ensure we are not stuck in connecting/waiting unless intended by resetState
      if (connectionStatus !== 'idle' && connectionStatus !== 'error' && connectionStatus !== 'partner_left') {
        setConnectionStatus('idle');
      }
      return;
    }

    const currentSessionDbRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}`);
    activeSessionDbRefForDisconnect.current = currentSessionDbRef; 
    const currentUserTypingFirebaseRef = ref(database, `${SESSIONS_PATH}/${currentSessionId}/typing_status/${userId}`);
    userTypingRefForDisconnect.current = currentUserTypingFirebaseRef;

    // Set up onDisconnect handlers for THIS client for THIS session
    onDisconnect(currentSessionDbRef).update({ status: 'closed', closedBy: userId, updatedAt: serverTimestamp() })
      .catch(err => console.error("Failed to set onDisconnect(update) for session:", err));
    onDisconnect(currentUserTypingFirebaseRef).set(false)
      .catch(err => console.warn("Failed to set onDisconnect for typing status:", err));
    
    if (unsubscribeSessionRef.current) unsubscribeSessionRef.current(); // Clean up previous session listener
    unsubscribeSessionRef.current = onValue(currentSessionDbRef, (snapshot) => {
      setIsConnecting(false); // Received data, so connection process is over

      if (!snapshot.exists()) {
        if (currentSessionId) { // Only if we thought we had a session
            const previousStatus = connectionStatus;
            // Session is gone. Cancel our onDisconnects as they are no longer relevant for this non-existent session.
            cancelAllFirebaseOnDisconnects();
            resetState({ 
                clearError: previousStatus === 'partner_left', // Clear "partner left" error if that's why we are here
                newStatus: previousStatus === 'partner_left' ? 'idle' : 'error' 
            });
            if (previousStatus !== 'partner_left' && previousStatus !== 'idle') {
                 setError(error || "Chat session has ended or no longer exists.");
            }
        }
        return;
      }

      const sessionData = snapshot.val() as ChatSession;
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
        if (unsubscribeMessagesRef.current) { unsubscribeMessagesRef.current(); unsubscribeMessagesRef.current = null; }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        setIsPartnerTyping(false);

        if (sessionData.closedBy && sessionData.closedBy !== userId) { // Partner closed
          if (connectionStatus !== 'partner_left') {
            setError((partnerAlias || 'Your partner') + " has left the chat.");
            setConnectionStatus('partner_left');
            cancelAllFirebaseOnDisconnects(); // Partner ended it, cancel our onDisconnects for this session
          }
        } else if (sessionData.closedBy === userId) { // This user (another tab or onDisconnect) closed it
          if (connectionStatus !== 'idle') { // Avoid loop if already reset by local disconnect call
             resetState({ newStatus: 'idle' }); // Our own action (or onDisconnect) closed it
          }
        } else { // Closed without a clear closer, or by system
          if (connectionStatus !== 'idle' && connectionStatus !== 'error') {
            setError("Chat session has been closed.");
            resetState({ newStatus: 'error', clearError: false });
          }
        }
        return; 
      }

      // If status is not 'closed'
      if (sessionData.status === 'active' && currentPartnerId) {
        if (connectionStatus !== 'connected') setConnectionStatus('connected');
        setError(null); 
        const partnerTyping = sessionData.typing_status && currentPartnerId ? !!sessionData.typing_status[currentPartnerId] : false;
        setIsPartnerTyping(partnerTyping);
      } else if (sessionData.status === 'waiting' && sessionData.user1Id === userId && !currentPartnerId) {
        if (connectionStatus !== 'waiting') setConnectionStatus('waiting');
        setIsPartnerTyping(false);
        setPartnerAlias(null); 
      } else if (sessionData.status === 'active' && !currentPartnerId && sessionData.user1Id === userId) {
         // Active but partner somehow disappeared without closing, revert to waiting if I am user1
         console.warn("Session active but partner ID missing. Reverting to waiting.");
         setConnectionStatus('waiting'); 
         setIsPartnerTyping(false);
         setPartnerAlias(null);
         // Consider updating Firebase status back to 'waiting'
         update(currentSessionDbRef, { status: 'waiting', user2Id: null, user2Name: null, closedBy: null });
      }
    }, (errorVal) => {
        console.error("Error listening to session:", errorVal);
        setError("Error in session: " + errorVal.message);
        resetState({ newStatus: 'error', clearError: false });
    });
    
    // Messages listener
    if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current(); // Clean up previous messages listener
    const messagesDbRefPath = `${SESSIONS_PATH}/${currentSessionId}/messages`;
    const currentMessagesDbRef = ref(database, messagesDbRefPath);
    unsubscribeMessagesRef.current = onValue(currentMessagesDbRef, (snapshot) => {
        const messagesData = snapshot.val();
        const newMessages = messagesData 
          ? Object.entries(messagesData).map(([id, msg]: [string, any]) => ({ ...msg, id })).sort((a, b) => a.timestamp - b.timestamp)
          : [];
        setMessages(newMessages);
    }, (errorVal) => {
        console.error("Error listening to messages:", errorVal);
        // Don't necessarily set global error for message fetch failure if session is fine
    });

    return () => { // Cleanup for this useEffect
      if (unsubscribeSessionRef.current) unsubscribeSessionRef.current();
      if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
      unsubscribeSessionRef.current = null;
      unsubscribeMessagesRef.current = null;
      
      // When currentSessionId changes (or component unmounts),
      // we MUST cancel the onDisconnect handlers associated with the *previous* session.
      // This is crucial if the user quickly reconnects to a *new* session.
      cancelAllFirebaseOnDisconnects();
    };
  }, [currentSessionId, userId, resetState, cancelAllFirebaseOnDisconnects, connectionStatus, partnerAlias, error]);


  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId || !userId || text.trim() === '' || connectionStatus !== 'connected') return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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
        // If sending a message, ensure chat is not marked as closed by this user
        await update(sessionRef, { updatedAt: serverTimestamp(), closedBy: null }); 
    } catch(e : any) {
        console.error("Failed to send message:", e);
        setError("Failed to send message: " + e.message);
    }
  }, [currentSessionId, userId, setMyTypingStatus, connectionStatus]);

  const disconnect = useCallback(async () => { // User explicitly clicks disconnect
    const sessionIdToDisconnect = currentSessionId;
    const localUserId = userId;

    if (!sessionIdToDisconnect || !localUserId) {
      resetState({newStatus: 'idle'}); // Should not happen if button is available, but good fallback
      return;
    }
    
    // Cancel pending onDisconnects first as we are handling manually
    await cancelAllFirebaseOnDisconnects();
    
    // Set typing to false for this user
    const userTypingFirebaseRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}/typing_status/${localUserId}`);
    try { await set(userTypingFirebaseRef, false); } 
    catch (e) { console.warn("Could not set typing to false before explicit disconnect", e); }

    // Update session to closed
    const sessionToUpdateRef = ref(database, `${SESSIONS_PATH}/${sessionIdToDisconnect}`);
    try {
      await update(sessionToUpdateRef, { 
        status: 'closed', 
        closedBy: localUserId, 
        updatedAt: serverTimestamp() 
      });
    } catch (err: any) {
      console.error("Error updating session on explicit disconnect: ", err);
      setError("Failed to end chat session: " + err.message);
      resetState({ newStatus: 'error', clearError: false }); // Go to error state but keep the error message
      return;
    }
    
    resetState({ newStatus: 'idle' }); // Successfully closed, go to idle
  }, [currentSessionId, userId, resetState, cancelAllFirebaseOnDisconnects]);

  const leaveClosedChatAndGoIdle = useCallback(async () => { // User leaves after partner has already left
    const sessionIdToLeave = currentSessionId;

    // onDisconnects for this client should have been cancelled when partner_left state was entered.
    await cancelAllFirebaseOnDisconnects(); // Belt-and-suspenders, ensure they are gone.

    if (sessionIdToLeave) {
      const sessionRef = ref(database, `${SESSIONS_PATH}/${sessionIdToLeave}`);
      try {
        await remove(sessionRef); // Final removal of the session
      } catch (e) {
        console.error("Error removing session in leaveClosedChatAndGoIdle:", e);
        setError("Failed to clean up chat session: " + (e as Error).message);
        resetState({ newStatus: 'error', clearError: false });
        return;
      }
    }
    resetState({ newStatus: 'idle' }); // Successfully removed or no session to remove, go idle.
  }, [currentSessionId, resetState, cancelAllFirebaseOnDisconnects]);
  
  return {
    userId,
    myAlias, 
    messages,
    connectionStatus,
    chatPartnerId,
    partnerAlias, 
    error,
    isPartnerTyping,
    isConnecting,
    connectToRandomUser,
    sendMessage,
    disconnect, 
    handleUserTyping,
    leaveClosedChatAndGoIdle, 
  };
}
