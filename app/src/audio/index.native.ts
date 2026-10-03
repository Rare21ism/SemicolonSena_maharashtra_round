import { AudioSource } from "./AudioSource";
import { NativeAudioSource } from "./AudioSource.native";

export * from "./AudioSource";

export const createAudioSource = (): AudioSource => new NativeAudioSource();
