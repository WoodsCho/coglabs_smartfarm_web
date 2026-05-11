import FarmModel3D from '../components/FarmModel3D';
import { useFarm } from '../contexts/FarmContext';

export default function MobilePage() {
  const { currentData, equipmentGroups } = useFarm();

  const ledGroup = equipmentGroups.find(g => g.type === 'led');
  const ledOn = (id: number) =>
    ledGroup?.equipment.find(e => e.id === id)?.status === 'ON';

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#0a1628' }}>
      <FarmModel3D
        led1On={ledOn(1)}
        led2On={ledOn(2)}
        led3On={ledOn(3)}
        sensorData={currentData}
      />
    </div>
  );
}
