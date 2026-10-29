import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { useGraphStore } from '../store/graphStore';
import { toast } from '../store/toastStore';
import type { AnodiNode, AnodiEdge, UserEdgeType } from '../types';

const MAX_URL_LEN = 100_000;

export function buildShareUrl(): string {
  const { nodes, edges, userEdgeTypes } = useGraphStore.getState();
  const payload = { version: 1, nodes, edges, userEdgeTypes };
  const packed = compressToEncodedURIComponent(JSON.stringify(payload));
  return `${location.origin}${location.pathname}${location.search}#board=${packed}`;
}

/** Build the share link, copy it to the clipboard and toast the result. */
export async function copyShareLink(): Promise<void> {
  try {
    const url = buildShareUrl();
    await navigator.clipboard.writeText(url);
    if (url.length > MAX_URL_LEN) {
      toast.info(`Link copied, but it is very long (${Math.round(url.length / 1000)}k chars) and may not open everywhere`);
    } else {
      toast.success('Share link copied');
    }
  } catch (err) {
    console.error('Failed to copy share link:', err);
    toast.error('Could not copy share link');
  }
}

/** If the URL hash carries a shared board, load it into a new board in observer mode. */
export function loadFromShareHash(): void {
  const hash = location.hash;
  if (!hash.startsWith('#board=')) return;
  const packed = hash.slice('#board='.length);
  try {
    const json = decompressFromEncodedURIComponent(packed);
    if (!json) throw new Error('Empty payload');
    const payload = JSON.parse(json) as { nodes: AnodiNode[]; edges: AnodiEdge[]; userEdgeTypes?: UserEdgeType[] };
    if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) throw new Error('Malformed board');
    const st = useGraphStore.getState();
    st.createBoard('Shared board');
    useGraphStore.getState().loadGraph(payload.nodes, payload.edges, payload.userEdgeTypes);
    useGraphStore.getState().setObserverMode(true);
    toast.info('Opened shared board (read-only)');
  } catch (err) {
    console.error('Failed to load shared board:', err);
    toast.error('Shared link is invalid');
  }
  history.replaceState(null, '', location.pathname + location.search);
}
