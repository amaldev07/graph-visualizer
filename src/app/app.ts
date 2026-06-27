import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';

type GraphMode = 'directed' | 'undirected';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('graphCanvas') private graphCanvas?: ElementRef<HTMLDivElement>;

  adjacencyList = signal(`A: B C
B: D E
C: F
D: C
E: F G
F:
G: A`);
  graphMode = signal<GraphMode>('directed');
  parseError = signal('');
  nodeCount = signal(0);
  edgeCount = signal(0);

  private graph?: Core;

  readonly modeLabel = computed(() =>
    this.graphMode() === 'directed' ? 'Directed graph' : 'Undirected graph',
  );

  ngAfterViewInit(): void {
    this.initializeGraph();
    this.renderGraph();
  }

  ngOnDestroy(): void {
    this.graph?.destroy();
  }

  setMode(mode: GraphMode): void {
    this.graphMode.set(mode);
    this.renderGraph();
  }

  renderGraph(): void {
    if (!this.graph) {
      return;
    }

    const parsed = this.parseAdjacencyList(this.adjacencyList(), this.graphMode());
    if (parsed.error) {
      this.parseError.set(parsed.error);
      return;
    }

    this.parseError.set('');
    this.nodeCount.set(parsed.nodeCount);
    this.edgeCount.set(parsed.edgeCount);
    this.graph.elements().remove();
    this.graph.add(parsed.elements);
    this.graph
      .layout({
        name: 'cose',
        animate: true,
        animationDuration: 450,
        fit: true,
        padding: 48,
        nodeRepulsion: 7000,
        idealEdgeLength: 110,
      })
      .run();
  }

  fitGraph(): void {
    this.graph?.fit(undefined, 48);
  }

  private initializeGraph(): void {
    if (!this.graphCanvas?.nativeElement) {
      return;
    }

    this.graph = cytoscape({
      container: this.graphCanvas.nativeElement,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#2563eb',
            'border-color': '#eff6ff',
            'border-width': 3,
            color: '#0f172a',
            'font-size': 13,
            'font-weight': 700,
            label: 'data(label)',
            'min-zoomed-font-size': 8,
            'overlay-opacity': 0,
            'text-margin-y': -14,
            'text-outline-color': '#ffffff',
            'text-outline-width': 3,
            width: 44,
            height: 44,
          },
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.1,
            width: 3,
          },
        },
        {
          selector: 'edge[directed = "false"]',
          style: {
            'target-arrow-shape': 'none',
          },
        },
        {
          selector: ':selected',
          style: {
            'background-color': '#f97316',
            'line-color': '#f97316',
            'target-arrow-color': '#f97316',
          },
        },
      ],
    });
  }

  private parseAdjacencyList(
    value: string,
    mode: GraphMode,
  ): { elements: ElementDefinition[]; nodeCount: number; edgeCount: number; error: string } {
    const nodes = new Set<string>();
    const edgeKeys = new Set<string>();
    const edges: ElementDefinition[] = [];
    const lines = value.split(/\r?\n/);

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.replace(/#.*/, '').trim();
      if (!line) {
        continue;
      }

      const parsedLine = this.parseLine(line);
      if (!parsedLine.source) {
        return {
          elements: [],
          nodeCount: 0,
          edgeCount: 0,
          error: `Line ${index + 1} needs a node name before its neighbors.`,
        };
      }

      nodes.add(parsedLine.source);
      for (const target of parsedLine.targets) {
        if (target === parsedLine.source) {
          continue;
        }

        nodes.add(target);
        const key =
          mode === 'undirected'
            ? [parsedLine.source, target].sort((a, b) => a.localeCompare(b)).join('--')
            : `${parsedLine.source}->${target}`;

        if (edgeKeys.has(key)) {
          continue;
        }

        edgeKeys.add(key);
        edges.push({
          data: {
            id: `edge-${edgeKeys.size}`,
            source: parsedLine.source,
            target,
            directed: String(mode === 'directed'),
          },
        });
      }
    }

    const elements: ElementDefinition[] = [...nodes]
      .sort((a, b) => a.localeCompare(b))
      .map((node) => ({ data: { id: node, label: node } }));

    elements.push(...edges);

    return {
      elements,
      nodeCount: nodes.size,
      edgeCount: edges.length,
      error: nodes.size ? '' : 'Enter at least one adjacency-list line.',
    };
  }

  private parseLine(line: string): { source: string; targets: string[] } {
    const separator = line.includes('->') ? '->' : line.includes(':') ? ':' : '';
    const parts = separator ? line.split(separator) : line.split(/\s+/, 2);
    const source = this.cleanNodeName(parts[0]);
    const targetText = separator ? parts.slice(1).join(' ') : line.slice(parts[0].length);
    const targets = targetText
      .split(/[\s,]+/)
      .map((item) => this.cleanNodeName(item))
      .filter(Boolean);

    return { source, targets };
  }

  private cleanNodeName(value: string): string {
    return value.trim().replace(/^["']|["']$/g, '');
  }
}
