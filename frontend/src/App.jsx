import { useState } from 'react';
import PortalSelect from './pages/PortalSelect';
import CitizenApp from './CitizenApp';
import MunicipalApp from './MunicipalApp';

export default function App() {
  const [portal, setPortal] = useState(null); // null | 'citizen' | 'municipal'

  if (portal === 'citizen') {
    return <CitizenApp onBack={() => setPortal(null)} />;
  }

  if (portal === 'municipal') {
    return <MunicipalApp onBack={() => setPortal(null)} />;
  }

  return <PortalSelect onSelect={setPortal} />;
}
