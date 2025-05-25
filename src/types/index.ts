
export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number | object; // Firebase serverTimestamp is an object initially
  isLocalSender?: boolean; // Optional: to style user's own messages differently
}

export interface ChatSession {
  id: string;
  user1Id: string | null;
  user2Id: string | null;
  status: 'waiting' | 'active' | 'closed';
  messages: Record<string, Omit<ChatMessage, 'id' | 'isLocalSender'>>; // Messages stored in Firebase
  typing_status?: Record<string, boolean>; // { [userId]: boolean }
  createdAt: number | object;
  updatedAt: number | object;
  user1Name?: string;
  user2Name?: string;
  closedBy?: string | null; // ID of the user who initiated the close
}

export type ConnectionStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error' | 'partner_left';
