import { AudioSource } from "./AudioSource";
import { WebAudioSource } from "./AudioSource.web";

export * from "./AudioSource";

// Default factory (will be overridden on native by Metro resolving .native.ts if needed)
export const createAudioSource = (): AudioSource => new WebAudioSource();
