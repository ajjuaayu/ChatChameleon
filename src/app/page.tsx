
"use client";

import { useChatSession } from '@/hooks/useChatSession';
import { Button } from '@/components/ui/button';
import { ChatArea } from '@/components/ChatArea';
import { Loader2, Users, AlertTriangle, Smile, UserX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

export default function HomePage() {
  const {
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
    disconnect,
    handleUserTyping,
    leaveClosedChatAndGoIdle,
  } = useChatSession();

  const renderContent = () => {
    switch (connectionStatus) {
      case 'idle':
        return (
          <div className="flex flex-col items-center gap-6">
            <Card className="w-full max-w-md text-center shadow-lg">
              <CardHeader>
                <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                  <Users className="w-12 h-12 text-primary" />
                </div>
                <CardTitle className="text-3xl font-bold">ChatChameleon</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Connect with someone new. Conversations are ephemeral and disappear when you leave.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <Button onClick={connectToRandomUser} size="lg" className="w-full">
                  Connect to a Stranger
                </Button>
                <ThemeToggleButton />
              </CardContent>
               <CardFooter className="flex flex-col items-center justify-center pt-2">
                {myAlias && <p className="text-xs text-muted-foreground flex items-center gap-1"><Smile size={14}/> Your Alias: {myAlias}</p>}
                {!myAlias && userId && <p className="text-xs text-muted-foreground">Your ID: {userId.slice(-6)}</p>}
              </CardFooter>
            </Card>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex flex-col items-center gap-2 text-lg">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p>Connecting as {myAlias || 'Anonymous'}...</p>
          </div>
        );
      case 'waiting':
        return (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg">Waiting for a partner...</p>
            {myAlias && <p className="text-sm text-muted-foreground">Your alias: {myAlias}</p>}
            <Button variant="outline" onClick={() => disconnect(false)}>Cancel</Button> {/* disconnect(false) means normal disconnect */}
             <div className="absolute top-4 right-4">
              <ThemeToggleButton />
            </div>
          </div>
        );
      case 'connected':
        return (
          <>
            <div className="absolute top-4 right-4 z-50"> 
              <ThemeToggleButton />
            </div>
            <ChatArea
              messages={messages}
              sendMessage={sendMessage}
              disconnect={() => disconnect(false)} // disconnect(false) means normal disconnect
              currentUserId={userId}
              currentUserAlias={myAlias} 
              partnerId={chatPartnerId}
              partnerAlias={partnerAlias} 
              isPartnerTyping={isPartnerTyping}
              onUserTyping={handleUserTyping}
              isChatActive={true}
            />
          </>
        );
      case 'partner_left':
        return (
          <div className="flex flex-col items-center gap-4 text-foreground">
             <div className="absolute top-4 right-4">
              <ThemeToggleButton />
            </div>
            <UserX className="w-12 h-12 text-primary" />
            <p className="text-lg">Chat Ended</p>
            {error && <p className="text-sm text-muted-foreground">{error}</p>}
            <Button onClick={async () => {
              await leaveClosedChatAndGoIdle(); 
              connectToRandomUser();
            }} variant="default" size="lg">
              Find New Chat
            </Button>
             <Button onClick={async () => {
              await leaveClosedChatAndGoIdle();
            }} variant="outline">
              Go Home
            </Button>
          </div>
        );
      case 'error':
        const isDisconnectionError = error && (error.toLowerCase().includes("disconnected") || error.toLowerCase().includes("session ended") || error.toLowerCase().includes("closed"));
        return (
          <div className="flex flex-col items-center gap-4 text-destructive">
             <div className="absolute top-4 right-4">
              <ThemeToggleButton />
            </div>
            {isDisconnectionError ? <UserX className="w-12 h-12" /> : <AlertTriangle className="w-12 h-12" />}
            <p className="text-lg">{isDisconnectionError ? "Chat Ended" : "Oops! Something went wrong."}</p>
            {error && <p className="text-sm">{error}</p>}
            <Button onClick={() => {
              if (isDisconnectionError) {
                leaveClosedChatAndGoIdle().then(() => connectToRandomUser());
              } else {
                window.location.reload();
              }
            }} variant="outline">
              {isDisconnectionError ? "Find New Chat" : "Try Again"}
            </Button>
            {isDisconnectionError && (
               <Button onClick={leaveClosedChatAndGoIdle} variant="ghost">
                Go Home
              </Button>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const mainContainerClasses = connectionStatus === 'connected' || connectionStatus === 'partner_left'
    ? 'h-screen p-0 sm:p-4'
    : 'min-h-screen p-4 justify-center';

  return (
    <main className={`relative flex flex-col items-center ${mainContainerClasses}`}>
      {renderContent()}
    </main>
  );
}
