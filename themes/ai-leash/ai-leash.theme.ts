// The ai-leash theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in ai-leash.settings.json and the generated ai-leash.settings.ts;
// change them with `astryx experimental theme editor set ai-leash ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {aiLeashSettings} from './ai-leash.settings';

export const aiLeashTheme = defineTheme({
  extends: aiLeashSettings,
  name: 'ai-leash',
});
