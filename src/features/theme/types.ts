export type BackgroundKind = 'builtin' | 'upload' | 'solid'
export type BackgroundFit = 'cover' | 'contain' | 'tile'
export type CursorStyle = 'default' | 'dot' | 'ring'
export type ButtonStyle = 'soft' | 'outline' | 'solid'
export type ButtonSize = 'compact' | 'comfortable'
export type Density = 'compact' | 'spacious'

export interface BackgroundSettings {
  kind: BackgroundKind
  builtinId: string
  uploadId?: string
  uploadType?: 'image' | 'video'
  uploadName?: string
  /** Average colour of the uploaded media, sampled once for the contrast guard. */
  uploadAvg?: string
  solid: string
  blur: number
  dim: number
  brightness: number
  saturation: number
  parallax: boolean
  fit: BackgroundFit
}

export interface GlassSettings {
  blur: number
  opacity: number
  border: number
  noise: number
  radius: number
}

export interface ThemeSettings {
  presetId: string
  accent: string
  positive: string
  negative: string
  background: BackgroundSettings
  glass: GlassSettings
  cursor: CursorStyle
  buttonStyle: ButtonStyle
  buttonSize: ButtonSize
  fontScale: number
  density: Density
  animations: boolean
  contrastGuard: boolean
}

export interface ThemeProfile {
  id: string
  name: string
  theme: ThemeSettings
  createdAt: string
}
