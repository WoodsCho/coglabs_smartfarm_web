import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatApi, type ChatMessage } from '../api/chat';
import cogLogo from '/logo.png';
import './Chatbot.css';

function getUserId(): string {
  const key = 'cog_chat_user_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '안녕하세요! 스마트팜 AI 어시스턴트입니다. 농장 환경, 센서 데이터에 대해 무엇이든 물어보세요.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = useRef(getUserId());

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      let sid = sessionId;
      if (!sid) {
        const { session_id } = await chatApi.createSession(userId.current);
        sid = session_id;
        setSessionId(sid);
      }

      const { reply } = await chatApi.sendMessage(userId.current, sid, text);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chatbot">
      {/* 채팅창 */}
      {open && (
        <div className="chatbot__window">
          {/* 헤더 */}
          <div className="chatbot__header">
            <div className="chatbot__header-info">
              <img src={cogLogo} alt="CoG" className="chatbot__header-logo" />
              <span>스마트팜 AI 어시스턴트</span>
            </div>
            <button className="chatbot__close" onClick={() => setOpen(false)} aria-label="닫기">
              <X size={18} />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div className="chatbot__messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot__message chatbot__message--${msg.role}`}>
                <div className="chatbot__bubble">
                  {msg.role === 'assistant'
                    ? <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{msg.content}</ReactMarkdown>
                    : msg.content
                  }
                </div>
              </div>
            ))}
            {loading && (
              <div className="chatbot__message chatbot__message--assistant">
                <div className="chatbot__bubble chatbot__bubble--loading">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 입력창 */}
          <div className="chatbot__input-area">
            <input
              ref={inputRef}
              className="chatbot__input"
              type="text"
              placeholder="메시지를 입력하세요..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="chatbot__send"
              onClick={send}
              disabled={!input.trim() || loading}
              aria-label="전송"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 토글 버튼 */}
      <button
        className={`chatbot__toggle ${open ? 'chatbot__toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="챗봇 열기/닫기"
      >
        {open ? <X size={24} /> : <img src={cogLogo} alt="CoG" className="chatbot__toggle-logo" />}
      </button>
    </div>
  );
}
