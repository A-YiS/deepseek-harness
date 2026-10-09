/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@deepseek-ai/dsh-client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  shortcutsInput: 'dsh-desktop:shortcuts-input',
  shortcutsCloseWindow: 'dsh-desktop:shortcuts-close-window',
  shortcutsGet: 'dsh-desktop:shortcuts-get',
  shortcutsEdit: 'dsh-desktop:shortcuts-edit',
  shortcutsChanged: 'dsh-desktop:shortcuts-changed',
  shortcutsRecording: 'dsh-desktop:shortcuts-recording',
  boot: 'dsh-desktop:boot',
  backendStatus: 'dsh-desktop:backend-status',
  backendConnect: 'dsh-desktop:backend-connect',
  backendDisconnect: 'dsh-desktop:backend-disconnect',
  enterWorkspace: 'dsh-desktop:enter-workspace',
  onboardingActive: 'dsh-desktop:onboarding-active',
  onboardingApiKey: 'dsh-desktop:onboarding-api-key',
  bootFailed: 'dsh-desktop:boot-failed',
  browserAcquire: 'dsh-desktop:browser-acquire',
  browserRelease: 'dsh-desktop:browser-release',
  browserOpenRequested: 'dsh-desktop:browser-open-requested',
  directoryPick: 'dsh-desktop:directory-pick',
  deviceInfo: 'dsh-desktop:device-info',
  localeBootstrap: 'dsh-desktop:locale-bootstrap',
  localeChanged: 'dsh-desktop:locale-changed',
  updatesStatus: 'dsh-desktop:updates-status',
  updatesOpen: 'dsh-desktop:updates-open',
  updatesPresentation: 'dsh-desktop:updates-presentation',
  nativeThemeSet: 'dsh-desktop:native-theme-set',
  windowFullscreen: 'dsh-desktop:window-fullscreen',
  windowsAppearance: 'dsh-desktop:windows-appearance',
  windowsMenu: 'dsh-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
}

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface DshDesktopProductApi {
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  readonly updates: {
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
  readonly backend: DesktopBackendApi
}

/** Backend selection and switching, exposed to product documents. */
export interface DesktopBackendApi {
  /** Which Host the application window currently drives. */
  status(): Promise<DesktopBackendStatus>
  /**
   * Point the application window at another Host and reboot it against that
   * Host's boot injections. The shell mints the session itself; the document
   * never sees the credential.
   * @param request - loopback target description.
   * @returns acceptance, with a warning when Host versions differ.
   */
  connect(request: DesktopBackendRequest): Promise<DesktopBackendConnectResult>
  /** Return to the Host this shell spawned and reboot the window against it. */
  disconnect(): Promise<DesktopBackendConnectResult>
}

/** Renderer-supplied description of the Host to attach to. */
export interface DesktopBackendRequest {
  /** Loopback origin of the target Host. */
  readonly url: string
  /** Operator-visible name for the target. */
  readonly label?: string
  /** Path of the session-authorization route; defaults to the plugin's. */
  readonly authorizePath?: string
  /** Path of the boot-injection route; defaults to the plugin's. */
  readonly bootPath?: string
}

/** Current backend selection published to the product UI. */
export interface DesktopBackendStatus {
  readonly mode: 'local' | 'remote'
  readonly label?: string
  readonly version?: string | null
}

/** One Host the application window can drive, with its credentials. */
export interface DesktopBackendTarget {
  /** Upstream origin every non-static application request is forwarded to. */
  readonly url: string
  /** Authentication cookie that origin admits. */
  readonly cookie: string
  /** Boot injection table this Host would render into its own index. */
  readonly injections: readonly unknown[]
  /** Operator-visible name of the target; absent for the spawned local Host. */
  readonly label?: string
  /** Host release version reported by the boot handshake, when it knows one. */
  readonly version?: string | null
}

/** Decoded result of one backend switch request. */
export type DesktopBackendConnectResult =
  | { readonly ok: true; readonly warning?: string }
  | { readonly ok: false; readonly error: string }

/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'dsh-app'

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('dsh desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error('dsh desktop: rejected IPC from an unowned renderer')
  }
}
