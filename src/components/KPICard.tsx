import { ReactNode } from 'react';
import './KPICard.css';

interface Props {
  title: string;
  value: string | number;
  unit?: string;
  icon: ReactNode;
  color?: string;
  subLabel?: string;
}

export default function KPICard({ title, value, unit, icon, color = '#3B82F6' }: Props) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__top">
        <span className="kpi-card__title">{title}</span>
        <span className="kpi-card__icon" style={{ color }}>{icon}</span>
      </div>
      <div className="kpi-card__value-row">
        <span className="kpi-card__value" style={{ color }}>{value}</span>
        {unit && <span className="kpi-card__unit">{unit}</span>}
      </div>
    </div>
  );
}
