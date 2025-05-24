
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
  partnerId: string | null;
  isPartnerTyping: boolean;
  onUserTyping: () => void;
}

export function ChatArea({ messages, sendMessage, disconnect, currentUserId, partnerId, isPartnerTyping, onUserTyping }: ChatAreaProps) {
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
    if (newMessage.trim()) {
      sendMessage(newMessage);
      setNewMessage('');
    }
  };
  
  const getInitials = (id: string | null) => {
    if (!id) return '?';
    return id.substring(0, 2).toUpperCase();
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    onUserTyping();
  };

  return (
    <Card className="w-full sm:max-w-3xl flex-grow flex flex-col shadow-xl sm:rounded-lg overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <UserCircle className="w-8 h-8 text-primary" />
          <CardTitle className="text-lg">
            Chatting with {partnerId ? `User ${partnerId.slice(-4)}` : 'a Stranger'}
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={disconnect} aria-label="Disconnect chat">
          <LogOut className="w-5 h-5 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="flex-grow p-0">
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
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {getInitials(msg.senderId)}
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
                  <p className="text-sm">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.senderId === currentUserId ? 'text-blue-200' : 'text-muted-foreground'}`}>
                     {new Date(typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {msg.senderId === currentUserId && (
                  <Avatar className="w-8 h-8">
                     <AvatarFallback className="bg-muted text-muted-foreground">
                      {getInitials(currentUserId)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isPartnerTyping && (
              <div className="flex items-center gap-2 justify-start">
                 <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {getInitials(partnerId)}
                    </AvatarFallback>
                  </Avatar>
                <div className="flex items-center p-2.5 rounded-lg bg-secondary text-secondary-foreground rounded-bl-none shadow">
                  <MessageCircleMore className="w-4 h-4 mr-2 animate-pulse" />
                  <span className="text-sm italic">typing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
          <Input
            type="text"
            placeholder="Type your message..."
            value={newMessage}
            onChange={handleInputChange}
            className="flex-grow"
            aria-label="Chat message input"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!newMessage.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
