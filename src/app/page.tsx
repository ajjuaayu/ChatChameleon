"use client";

import { useChatSession } from '@/hooks/useChatSession';
import { Button } from '@/components/ui/button';
import { ChatArea } from '@/components/ChatArea';
import { Loader2, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const {
    userId,
    messages,
    connectionStatus,
    chatPartnerId,
    error,
    connectToRandomUser,
    sendMessage,
    disconnect,
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
              <CardContent>
                <Button onClick={connectToRandomUser} size="lg" className="w-full">
                  Connect to a Stranger
                </Button>
              </CardContent>
            </Card>
             {userId && <p className="text-xs text-muted-foreground">Your ID: {userId.slice(-6)}</p>}
          </div>
        );
      case 'connecting':
        return (
          <div className="flex flex-col items-center gap-2 text-lg">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p>Connecting...</p>
          </div>
        );
      case 'waiting':
        return (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg">Waiting for a partner...</p>
            <Button variant="outline" onClick={disconnect}>Cancel</Button>
          </div>
        );
      case 'connected':
        return (
          <ChatArea
            messages={messages}
            sendMessage={sendMessage}
            disconnect={disconnect}
            currentUserId={userId}
            partnerId={chatPartnerId}
          />
        );
      case 'error':
        return (
          <div className="flex flex-col items-center gap-4 text-destructive">
            <AlertTriangle className="w-12 h-12" />
            <p className="text-lg">Oops! Something went wrong.</p>
            {error && <p className="text-sm">{error}</p>}
            <Button onClick={() => window.location.reload()} variant="outline">
              Try Again
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      {renderContent()}
    </main>
  );
}
