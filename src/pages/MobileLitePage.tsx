import FarmModelLite from '../components/FarmModelLite';
import { useFarm } from '../contexts/FarmContext';

export default function MobileLitePage() {
  const { currentData, equipmentGroups } = useFarm();

  const ledGroup = equipmentGroups.find(g => g.type === 'led');
  const ledOn = (id: number) =>
    ledGroup?.equipment.find(e => e.id === id)?.status === 'ON';

  return (
    <FarmModelLite
      led1On={ledOn(1)}
      led2On={ledOn(2)}
      led3On={ledOn(3)}
      sensorData={currentData}
    />
  );
}
