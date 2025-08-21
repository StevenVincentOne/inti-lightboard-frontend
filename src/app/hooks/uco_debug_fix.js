const fs = require('fs');

let content = fs.readFileSync('useUCO.tsx', 'utf8');

// Find the uco.field_update case and add debug logging
const searchPattern = `        console.log('[UCO] Field update received:', message.component, message.updates);
        
        if (uco && message.component && message.updates) {`;

const replacement = `        console.log('[UCO] Field update received:', message.component, message.updates);
        console.log('[UCO] Current UCO state before update:', uco ? 'EXISTS' : 'NULL');
        console.log('[UCO] Message structure:', { type: message.type, component: message.component, hasUpdates: !!message.updates });
        
        if (uco && message.component && message.updates) {
          console.log('[UCO] Processing field update for component:', message.component);
          console.log('[UCO] Update data:', message.updates);`;

if (content.includes(searchPattern)) {
  content = content.replace(searchPattern, replacement);
  
  // Also add debug after the update is applied
  const afterUpdate = `          console.log('[UCO] Applied field update to', message.component);
          setUCO(updatedUCO);`;
          
  const debugAfter = `          console.log('[UCO] Applied field update to', message.component);
          console.log('[UCO] Updated topic component:', updatedUCO.data.components.topic);
          console.log('[UCO] Topic loaded status should be:', updatedUCO.data.components.topic.loaded || updatedUCO.data.components.topic.uuid ? true : false);
          setUCO(updatedUCO);`;
          
  content = content.replace(afterUpdate, debugAfter);
  
  fs.writeFileSync('useUCO.tsx', content);
  console.log('✅ Added debug logging to uco.field_update handler');
} else {
  console.log('❌ Pattern not found in useUCO.tsx');
}