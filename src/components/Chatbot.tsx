import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, History, Plus, ChevronLeft, MessageSquare, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatApi, type ChatMessage, type SessionInfo } from '../api/chat';
import cogLogo from '/logo.png';
import './Chatbot.css';

function getUserId(): string {
  return 'cog_admin';
}

function formatDate(ts: number): string {
  // DynamoDB에 초 단위로 저장되므로 ms로 변환
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function Chatbot({ embedded = false, noAutoFocus = false }: { embedded?: boolean; noAutoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '안녕하세요! 스마트팜 AI 어시스턴트입니다. 농장 환경, 센서 데이터에 대해 무엇이든 물어보세요.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = useRef(getUserId());

  useEffect(() => {
    if (open || embedded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (embedded && !noAutoFocus) setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, embedded, messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      // session_id 없이 보내면 Lambda가 자동 생성 후 반환
      const { reply, session_id } = await chatApi.sendMessage(userId.current, sessionId ?? '', text);
      if (!sessionId && session_id) setSessionId(session_id);
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

  const openHistory = useCallback(async () => {
    setView('history');
    setHistoryLoading(true);
    try {
      const { sessions: list } = await chatApi.listSessions(userId.current);
      setSessions(list.filter((s) => s.message_count > 0));
    } catch {
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (info: SessionInfo) => {
    setHistoryLoading(true);
    try {
      const { messages: msgs } = await chatApi.getMessages(info.session_id);
      setMessages(msgs.length > 0 ? msgs : [
        { role: 'assistant', content: '대화 내용을 불러왔습니다.' },
      ]);
      setSessionId(info.session_id);
    } catch {
      setMessages([{ role: 'assistant', content: '대화를 불러오는 중 오류가 발생했습니다.' }]);
    } finally {
      setHistoryLoading(false);
      setView('chat');
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([
      { role: 'assistant', content: '안녕하세요! 스마트팜 AI 어시스턴트입니다. 농장 환경, 센서 데이터에 대해 무엇이든 물어보세요.' },
    ]);
    setSessionId(null);
    setInput('');
    setView('chat');
  }, []);

  const deleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await chatApi.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch {
      // 삭제 실패 시 조용히 무시
    }
  }, []);

  const SUGGESTIONS = [
    '현재 온실 온도와 습도가 어때?',
    '오늘 수확 예정 작물이 있어?',
    '이상 감지된 센서가 있어?',
    '오늘 병해충 위험도 알려줘',
  ];

  const sendSuggestion = useCallback((text: string) => {
    setInput(text);
    // 다음 렌더 후 send 호출을 위해 setTimeout 사용
    setTimeout(() => {
      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      setLoading(true);
      chatApi.sendMessage(userId.current, sessionId ?? '', text)
        .then(({ reply, session_id }) => {
          if (!sessionId && session_id) setSessionId(session_id);
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        })
        .catch(() => {
          setMessages((prev) => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
        })
        .finally(() => setLoading(false));
    }, 0);
  }, [sessionId]);

  const isInitialState = messages.length === 1 && messages[0].role === 'assistant';

  const chatWindow = (
    <div className={`chatbot__window${embedded ? ' chatbot__window--embedded' : ''}`}>
      {/* 헤더 */}
      <div className="chatbot__header">
        <div className="chatbot__header-info">
          {view === 'history' ? (
            <button className="chatbot__header-btn" onClick={() => setView('chat')} aria-label="뒤로">
              <ChevronLeft size={18} />
            </button>
          ) : (
            <img src={cogLogo} alt="CoG" className="chatbot__header-logo" />
          )}
          <span>{view === 'history' ? '대화 기록' : '스마트팜 AI 어시스턴트'}</span>
        </div>
        <div className="chatbot__header-actions">
          {view === 'chat' && (
            <>
              <button className="chatbot__header-btn" onClick={startNewChat} aria-label="새 대화">
                <Plus size={17} />
              </button>
              <button className="chatbot__header-btn" onClick={openHistory} aria-label="대화 기록">
                <History size={17} />
              </button>
            </>
          )}
          {!embedded && (
            <button className="chatbot__close" onClick={() => setOpen(false)} aria-label="닫기">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 히스토리 패널 */}
      {view === 'history' ? (
        <div className="chatbot__history">
          {historyLoading ? (
            <div className="chatbot__history-loading">불러오는 중...</div>
          ) : sessions.length === 0 ? (
            <div className="chatbot__history-empty">
              <MessageSquare size={32} strokeWidth={1.3} />
              <span>저장된 대화가 없습니다</span>
            </div>
          ) : (
            <ul className="chatbot__session-list">
              {sessions.map((s) => (
                <li key={s.session_id} className="chatbot__session-row">
                  <button className="chatbot__session-item" onClick={() => loadSession(s)}>
                    <div className="chatbot__session-title">{s.last_message || s.title || '(제목 없음)'}</div>
                    <div className="chatbot__session-meta">
                      <span>{formatDate(s.last_active)}</span>
                      <span className="chatbot__session-dot" />
                      <span>{s.message_count}개 메시지</span>
                    </div>
                  </button>
                  <button
                    className="chatbot__session-delete"
                    onClick={(e) => deleteSession(e, s.session_id)}
                    aria-label="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* 메시지 목록 */}
          <div className="chatbot__messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot__message chatbot__message--${msg.role}`}>
                <div className="chatbot__bubble">
                  {msg.role === 'assistant'
                    ? <ReactMarkdown
                        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                        components={{
                          img: ({ src, alt }) => (
                            <img
                              src={src}
                              alt={alt ?? 'CCTV'}
                              style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '6px', display: 'block' }}
                            />
                          ),
                        }}
                      >{msg.content}</ReactMarkdown>
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

          {/* 빠른 선택지 */}
          {isInitialState && !loading && (
            <div className="chatbot__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chatbot__suggestion-btn" onClick={() => sendSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

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
        </>
      )}
    </div>
  );

  if (embedded) {
    return chatWindow;
  }

  return (
    <div className="chatbot">
      {/* 채팅창 */}
      {open && chatWindow}

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
