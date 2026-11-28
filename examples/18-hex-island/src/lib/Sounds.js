// connect-ai-three: the original plays five mp3 files through howler.js. Their source is not recorded, so this kit
// ships no sound: the same interface, silent.
class SoundsManager {
  constructor() { this.mutedSounds = new Set() }
  play() { return undefined }
  mute(names) { names.forEach((name) => this.mutedSounds.add(name)) }
  unmute(names) { names.forEach((name) => this.mutedSounds.delete(name)) }
}

export const Sounds = new SoundsManager()
