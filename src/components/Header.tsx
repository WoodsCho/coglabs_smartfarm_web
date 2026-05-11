import NotificationCenter from './NotificationCenter';
import './Header.css';

interface HeaderProps {
  username?: string;
}

export default function Header({ username }: HeaderProps) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <header className="topheader">
      <div className="topheader__left">
        <p className="topheader__greeting">안녕하세요, {username || '사용자'}님</p>
        <p className="topheader__date">{today}</p>
      </div>
      <div className="topheader__right">
        <NotificationCenter />
      </div>
    </header>
  );
}
