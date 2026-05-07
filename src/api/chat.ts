const CHAT_API_URL =
  import.meta.env.VITE_CHAT_API_URL ||
  import.meta.env.VITE_API_URL ||
  'https://xr0u2z6sq4.execute-api.ap-northeast-2.amazonaws.com';

const CHAT_PATH = import.meta.env.VITE_CHAT_PATH || '/chat';

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CHAT_API_URL}${CHAT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
  return res.json();
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const chatApi = {
  createSession: (userId: string, title = '새 대화') =>
    post<{ session_id: string }>({ action: 'create_session', user_id: userId, title }),

  sendMessage: (userId: string, sessionId: string, message: string) =>
    post<{ reply: string; session_id: string }>({
      action: 'chat',
      user_id: userId,
      session_id: sessionId,
      message,
    }),
};
