import { AudioSource } from "./AudioSource";
import { WebAudioSource } from "./AudioSource.web";

export * from "./AudioSource";
export * from "./SpeechRecognizer";

export const createAudioSource = (): AudioSource => new WebAudioSource();
