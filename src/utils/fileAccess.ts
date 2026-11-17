export interface IncomingFile {
  file: File
}

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

interface FileAccessWindow {
  showOpenFilePicker?: (opts: { multiple?: boolean; types?: PickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (opts: { suggestedName?: string; types?: PickerType[] }) => Promise<FileSystemFileHandle>
  launchQueue?: { setConsumer: (consumer: (params: { files?: FileSystemHandle[] }) => void) => void }
}

const fsWindow = (): FileAccessWindow => window as unknown as FileAccessWindow

export const PROJECT_EXTENSIONS = ['smp', 'sma']
export const DATA_EXTENSIONS = ['txt', 'dat', 'csv', 'prn', 'asc']

const OPEN_TYPES: PickerType[] = [
  { description: 'SMP project or data', accept: { 'text/plain': ['.smp', '.sma', ...DATA_EXTENSIONS.map((e) => `.${e}`)] } },
]
const SAVE_TYPES: PickerType[] = [
  { description: 'SMP Project (*.SMP)', accept: { 'application/octet-stream': ['.smp', '.SMP'] } },
]

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function canPickFiles(): boolean {
  return typeof fsWindow().showOpenFilePicker === 'function'
}

// open
export async function pickFilesToOpen(): Promise<IncomingFile[] | null> {
  const picker = fsWindow().showOpenFilePicker
  if (!picker) return null
  try {
    const handles = await picker({ multiple: true, types: OPEN_TYPES })
    return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile() })))
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return []
    return null
  }
}

export function collectDroppedFiles(dataTransfer: DataTransfer | null): Promise<IncomingFile[]> {
  if (!dataTransfer) return Promise.resolve([])
  return Promise.resolve(Array.from(dataTransfer.files || []).map((file) => ({ file })))
}

export function initLaunchQueue(consumer: (files: IncomingFile[]) => void): void {
  const queue = fsWindow().launchQueue
  if (!queue) return
  queue.setConsumer(async (params) => {
    const handles = (params.files || []).filter((h): h is FileSystemFileHandle => h.kind === 'file')
    if (handles.length === 0) return
    const files = await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile() })))
    consumer(files)
  })
}

export async function readFileText(file: File): Promise<string> {
  return new TextDecoder('windows-1252').decode(await file.arrayBuffer())
}

// save
export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null | undefined> {
  const picker = fsWindow().showSaveFilePicker
  if (!picker) return undefined
  try {
    return await picker({ suggestedName, types: SAVE_TYPES })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    return undefined
  }
}

export async function writeToHandle(handle: FileSystemFileHandle, data: ArrayBuffer): Promise<boolean> {
  try {
    const writable = await handle.createWritable()
    await writable.write(data)
    await writable.close()
    return true
  } catch (err) {
    console.warn('Writing to the chosen file failed:', err)
    return false
  }
}
