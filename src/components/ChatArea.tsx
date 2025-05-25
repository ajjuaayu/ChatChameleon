
"use client";

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, LogOut, UserCircle, MessageCircleMore } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface ChatAreaProps {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  disconnect: () => void;
  currentUserId: string;
  currentUserAlias: string | null;
  partnerId: string | null;
  partnerAlias: string | null;
  isPartnerTyping: boolean;
  onUserTyping: () => void;
  isChatActive: boolean; 
}

export function ChatArea({ 
  messages, 
  sendMessage, 
  disconnect, 
  currentUserId, 
  currentUserAlias,
  partnerId, 
  partnerAlias,
  isPartnerTyping, 
  onUserTyping,
  isChatActive
}: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages, isPartnerTyping]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && isChatActive) {
      sendMessage(newMessage);
      setNewMessage('');
    }
  };
  
  const getInitials = (alias: string | null, id: string | null) => {
    if (alias) {
      return alias.substring(0, 2).toUpperCase();
    }
    if (id) {
      return id.substring(0, 2).toUpperCase();
    }
    return '?';
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (isChatActive) {
      onUserTyping();
    }
  };

  const displayedPartnerName = partnerAlias || (partnerId ? `User ${partnerId.slice(-4)}` : 'Stranger');

  return (
    <Card className="h-full w-full flex flex-col shadow-xl overflow-hidden sm:rounded-lg sm:max-w-3xl sm:mx-auto sm:my-4">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2 overflow-hidden"> {/* Added overflow-hidden for safety if name is too long */}
          <UserCircle className="w-8 h-8 text-primary shrink-0" />
          <CardTitle className="text-lg truncate" title={displayedPartnerName}>
            Chatting with {displayedPartnerName}
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={disconnect} aria-label="Disconnect chat" disabled={!isChatActive} className="shrink-0">
          <LogOut className="w-5 h-5 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="flex-grow p-0 min-h-0"> {/* min-h-0 is crucial for flex-grow with scroll */}
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${
                  msg.senderId === currentUserId ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.senderId !== currentUserId && (
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {getInitials(partnerAlias, msg.senderId)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] p-3 rounded-lg shadow ${
                    msg.senderId === currentUserId
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-secondary text-secondary-foreground rounded-bl-none'
                  }`}
                >
                  <p className="text-sm break-words">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.senderId === currentUserId ? 'text-primary-foreground/80' : 'text-muted-foreground/80'}`}>
                     {new Date(typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {msg.senderId === currentUserId && (
                  <Avatar className="w-8 h-8 shrink-0">
                     <AvatarFallback className="bg-muted text-muted-foreground">
                      {getInitials(currentUserAlias, currentUserId)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isPartnerTyping && isChatActive && (
              <div className="flex items-center gap-2 justify-start">
                 <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {getInitials(partnerAlias, partnerId)}
                    </AvatarFallback>
                  </Avatar>
                <div className="flex items-center p-2.5 rounded-lg bg-secondary text-secondary-foreground rounded-bl-none shadow">
                  <MessageCircleMore className="w-4 h-4 mr-2 animate-pulse" />
                  <span className="text-sm italic">{partnerAlias || 'Partner'} is typing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t shrink-0">
        <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
          <Input
            type="text"
            placeholder={isChatActive ? "Type your message..." : "Chat ended"}
            value={newMessage}
            onChange={handleInputChange}
            className="flex-grow"
            aria-label="Chat message input"
            disabled={!isChatActive}
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!newMessage.trim() || !isChatActive} className="shrink-0">
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
