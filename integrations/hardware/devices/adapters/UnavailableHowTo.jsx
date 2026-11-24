// Host availability notice only; no substitute geometry is introduced.
import { useContext, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { ModelContext } from '/Components/ModelContext.jsx';

export default function UnavailableHowTo({ topic }) {
  const { setClickedPath } = useContext(ModelContext);
  useEffect(() => { setClickedPath(topic); }, [topic]);
  return <Html center>
    <div role="status" style={{ width: 'min(70vw, 340px)', padding: '20px', background: '#fff', border: '1px solid #ccc', color: '#222', fontFamily: 'sans-serif' }}>
      <strong>Original illustration unavailable</strong>
      <p>The pinned upstream Large CNC manual does not include the 3D file for this topic. Its original instructions remain available alongside this notice.</p>
      <p>该章节原仓库未提供三维图示，原说明文字和导航仍可使用。</p>
    </div>
  </Html>;
}
