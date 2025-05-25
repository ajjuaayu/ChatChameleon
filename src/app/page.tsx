
"use client";

import { useChatSession } from '@/hooks/useChatSession';
import { Button } from '@/components/ui/button';
import { ChatArea } from '@/components/ChatArea';
import { Loader2, Users, AlertTriangle, Smile, UserX, WifiOff } from 'lucide-react';
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
    isConnecting, // Added this
    connectToRandomUser,
    sendMessage,
    disconnect,
    handleUserTyping,
    leaveClosedChatAndGoIdle,
  } = useChatSession();

  const renderContent = () => {
    if (isConnecting && connectionStatus === 'connecting') { // Show connecting spinner immediately
      return (
        <div className="flex flex-col items-center gap-2 text-lg">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p>Connecting as {myAlias || 'Anonymous'}...</p>
           <div className="absolute top-4 right-4"> <ThemeToggleButton /></div>
        </div>
      );
    }

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
                <Button 
                  onClick={connectToRandomUser} 
                  size="lg" 
                  className="w-full"
                  disabled={isConnecting} // Disable button while connecting
                >
                  {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
      case 'connecting': // This state might be brief if isConnecting covers it
        return (
          <div className="flex flex-col items-center gap-2 text-lg">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p>Connecting as {myAlias || 'Anonymous'}...</p>
            <div className="absolute top-4 right-4"> <ThemeToggleButton /></div>
          </div>
        );
      case 'waiting':
        return (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg">Waiting for a partner...</p>
            {myAlias && <p className="text-sm text-muted-foreground">Your alias: {myAlias}</p>}
            <Button variant="outline" onClick={() => disconnect()} disabled={isConnecting}>Cancel</Button>
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
              disconnect={() => disconnect()} 
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
            <UserX className="w-16 h-16 text-primary" />
            <h2 className="text-2xl font-semibold">Chat Ended</h2>
            <p className="text-muted-foreground">{error || (partnerAlias || 'Your partner') + " has left the chat."}</p>
            <div className="flex gap-3 mt-4">
              <Button onClick={async () => {
                await leaveClosedChatAndGoIdle(); 
                connectToRandomUser();
              }} variant="default" size="lg">
                Find New Chat
              </Button>
               <Button onClick={leaveClosedChatAndGoIdle} variant="outline" size="lg">
                Go Home
              </Button>
            </div>
          </div>
        );
      case 'error':
        const isDisconnectionError = error && (error.toLowerCase().includes("disconnected") || error.toLowerCase().includes("session ended") || error.toLowerCase().includes("closed by") || error.toLowerCase().includes("no longer exists"));
        return (
          <div className="flex flex-col items-center gap-4 text-destructive">
             <div className="absolute top-4 right-4">
              <ThemeToggleButton />
            </div>
            {isDisconnectionError ? <WifiOff className="w-16 h-16" /> : <AlertTriangle className="w-16 h-16" />}
            <h2 className="text-2xl font-semibold">{isDisconnectionError ? "Chat Disconnected" : "Oops!"}</h2>
            {error && <p className="text-center max-w-sm">{error}</p>}
            <div className="flex gap-3 mt-4">
            <Button onClick={() => {
              if (isDisconnectionError || error?.includes("Connection error")) { // If it's a specific known disconnect or initial connection error
                leaveClosedChatAndGoIdle().then(() => connectToRandomUser()); // Try to start fresh
              } else {
                window.location.reload(); // Generic error, try reload
              }
            }} variant="outline" size="lg">
              {isDisconnectionError || error?.includes("Connection error") ? "Find New Chat" : "Try Again"}
            </Button>
            {(isDisconnectionError || error?.includes("Connection error")) && (
               <Button onClick={leaveClosedChatAndGoIdle} variant="ghost" size="lg">
                Go Home
              </Button>
            )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const mainContainerClasses = 
    connectionStatus === 'connected' 
    ? 'h-screen p-0 sm:p-4' 
    : (connectionStatus === 'partner_left' || connectionStatus === 'error')
    ? 'min-h-screen p-4 flex flex-col justify-center' // Centering for partner_left and error
    : 'min-h-screen p-4 justify-center';


  return (
    <main className={`relative flex flex-col items-center ${mainContainerClasses}`}>
      {renderContent()}
    </main>
  );
}
