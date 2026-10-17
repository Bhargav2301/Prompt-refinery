export const CREATIVE_TOOLS = ['general', 'sora', 'veo', 'runway', 'kling', 'luma', 'midjourney', 'stable-diffusion', 'flux'] as const;
export type CreativeTool = typeof CREATIVE_TOOLS[number];
export const TOOL_LABELS: Record<CreativeTool, string> = { general: 'General refinement', sora: 'Sora', veo: 'Veo', runway: 'Runway', kling: 'Kling', luma: 'Luma', midjourney: 'Midjourney', 'stable-diffusion': 'Stable Diffusion', flux: 'FLUX' };

export const PROMPT_SOURCES = [
  { id: 'sora-cinematic', title: 'ruvnet · Cinematic Sora prompts', url: 'https://gist.github.com/ruvnet/e20537eb50866b2d837d4d13b066bd88', type: 'Community collection' },
  { id: 'video-collection', title: 'Awesome AI video prompts', url: 'https://github.com/geekjourneyx/awesome-ai-video-prompts', type: 'Community collection' },
  { id: 'veo', title: 'Google DeepMind · Veo prompt guide', url: 'https://deepmind.google/models/veo/prompt-guide/', type: 'Official guide' },
  { id: 'best-sora', title: 'Best Sora Prompts', url: 'https://bestsoraprompts.com/', type: 'Community collection' },
  { id: 'sora-techniques', title: 'Sora Prompting', url: 'https://www.soraprompting.com/', type: 'Community guide' },
  { id: 'runway-legacy', title: 'Runway · Gen-3 Alpha (retired)', url: 'https://help.runwayml.com/hc/en-us/articles/30586818553107-Gen-3-Alpha-Prompting-Guide', type: 'Historical guide' },
  { id: 'runway', title: 'Runway · Text to Video prompting', url: 'https://help.runwayml.com/hc/en-us/articles/42460036199443-Text-to-Video-Prompting-Guide', type: 'Official guide' },
  { id: 'kling', title: 'Segmind · Kling prompts', url: 'https://blog.segmind.com/best-text-to-video-prompts-for-kling-ai-with-examples/', type: 'Provider guide' },
  { id: 'luma', title: 'fal · Luma Ray 2 examples', url: 'https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/examples', type: 'Provider examples' },
  { id: 'sd-templates', title: 'Dalabad · Stable Diffusion templates', url: 'https://github.com/Dalabad/stable-diffusion-prompt-templates', type: 'Community collection' },
  { id: 'mj-awesome', title: 'Ezagor-dev · Midjourney prompts', url: 'https://github.com/Ezagor-dev/awesome-midjourney-prompts', type: 'Community collection' },
  { id: 'mj-lexgo', title: 'LexGoArt · Midjourney prompts', url: 'https://github.com/LexGoArt/Midjourney-Prompts', type: 'Community collection' },
  { id: 'sd-amazing', title: 'FurkanGozukara · Stable Diffusion prompts', url: 'https://github.com/FurkanGozukara/Stable-Diffusion/blob/main/Amazing-Prompts-List-For-Stable-Diffusion.md', type: 'Community collection' },
  { id: 'flux', title: '3DAI Studio · FLUX prompts', url: 'https://www.3daistudio.com/blog/the-best-flux-black-forest-labs-prompts-for-good-results-in-ai-image-generation', type: 'Community guide' },
  { id: 'sd-mpost', title: 'Metaverse Post · Stable Diffusion examples', url: 'https://mpost.io/best-100-stable-diffusion-prompts-the-most-beautiful-ai-text-to-image-prompts/', type: 'Community collection' },
] as const;

const toolGuidance: Record<CreativeTool, string> = {
  general: '',
  sora: 'Write a visual scene with subject, setting, action, lighting, camera position and a clear progression. Keep identity and physical movement consistent. Separate dialogue or sound direction when requested.',
  veo: 'Describe framing, scene, subject movement, lighting and visual treatment. If audio is requested, distinguish ambience, effects and quoted speech, identifying each speaker. Keep a short scene focused on one event.',
  runway: 'Use clear visual descriptions and positive motion language. Describe camera movement separately from subject action. For image-to-video, focus on motion rather than re-describing every visible detail. Do not add obsolete Gen-3 flags.',
  kling: 'Establish the subject and setting before describing the action. Specify a physically coherent path and camera movement. Keep subject identity, lighting and background consistent through the shot.',
  luma: 'Describe a continuous scene, the subject action and a feasible camera path. State the starting composition and intended ending. If supplied, treat the reference image as the visual starting point.',
  midjourney: 'Prioritize subject, composition, medium, light and palette. Put exact requested text in quotes. Only include version-specific parameters when the user specifies a version and the syntax is known; otherwise describe aspect ratio in a separate settings note.',
  'stable-diffusion': 'Specify subject, composition, visual medium, light and detail. Offer a distinct optional negative prompt only for a model that supports it. Do not invent checkpoint names, LoRA identifiers, sampler settings or embedding tokens.',
  flux: 'Use coherent natural-language scene descriptions with spatial relationships, materials and lighting. Put required typography in quotes and describe its placement. Do not assume support for a negative-prompt field or Stable Diffusion weighting syntax.',
};

export function creativeInstructions(tool: CreativeTool) {
  if (tool === 'general') return '';
  return `Create a ready-to-paste ${['midjourney', 'stable-diffusion', 'flux'].includes(tool) ? 'image' : 'video'} generation prompt for ${TOOL_LABELS[tool]} from the user description. ${toolGuidance[tool]} Preserve the user's creative choices; do not generate the image/video itself. Do not claim that writing a resolution, duration or frame rate guarantees that setting. Keep tool settings separate from the prompt. Use only supplied reference details. Ask for missing essential details instead of inventing attached assets.`;
}

export interface PromptTemplate { id: string; title: string; kind: 'image' | 'video'; tool: CreativeTool; description: string; prompt: string; sources: string[] }
const scenes = [
  { key: 'product', title: 'Product reveal', description: 'Material, silhouette and a clear focal point.', subject: 'a handmade ceramic speaker on a dark stone plinth', scene: 'a quiet studio with a narrow strip of warm side light', detail: 'subtle glaze variations and a crisp silhouette', motion: 'a slow lateral camera move reveals the speaker grille as the light catches its curved edge' },
  { key: 'portrait', title: 'Character portrait', description: 'A consistent character with an expressive setting.', subject: 'a cartographer wearing a weathered blue coat', scene: 'a seaside workshop at dawn', detail: 'salt-faded fabric, an attentive expression and maps behind the subject', motion: 'the cartographer unfolds a map while the camera gently pushes from a medium shot to a close-up' },
  { key: 'world', title: 'World building', description: 'Environment, atmosphere and visual scale.', subject: 'a cliffside village built around a suspended garden', scene: 'the first warm light after a rainstorm', detail: 'wet stairways, copper roofs and small figures that establish scale', motion: 'the camera glides along a walkway toward the garden as mist drifts through the valley' },
  { key: 'editorial', title: 'Editorial concept', description: 'A strong visual metaphor and intentional composition.', subject: 'a paper boat carrying a miniature orchard', scene: 'a shallow pool on a pale seamless surface', detail: 'balanced negative space, handmade paper texture and restrained green accents', motion: 'the boat moves gently across the pool while the camera remains low and tracks alongside it' },
];
const sources: Record<string, string[]> = { sora: ['sora-cinematic', 'best-sora', 'sora-techniques', 'video-collection'], veo: ['veo', 'video-collection'], runway: ['runway', 'runway-legacy'], kling: ['kling'], luma: ['luma'], midjourney: ['mj-awesome', 'mj-lexgo'], 'stable-diffusion': ['sd-templates', 'sd-amazing', 'sd-mpost'], flux: ['flux'] };

// Original Clarift starter templates. Source links are reading references, not a copied prompt corpus.
export const PROMPT_LIBRARY: PromptTemplate[] = CREATIVE_TOOLS.filter(tool => tool !== 'general').flatMap(tool => scenes.map(scene => {
  const kind = ['midjourney', 'stable-diffusion', 'flux'].includes(tool) ? 'image' : 'video';
  return { id: `${tool}-${scene.key}`, title: scene.title, kind, tool, description: scene.description,
    prompt: `Create a ${kind} prompt for ${TOOL_LABELS[tool]}: ${scene.subject}, in ${scene.scene}. Emphasize ${scene.detail}.${kind === 'video' ? ` Motion: ${scene.motion}. Keep the scene continuous.` : ' Use an intentional composition with a clear focal point.'} Adapt this starting idea to my description: [describe your changes].`, sources: sources[tool] };
}));
