import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import type { AnnotationTool } from '@/lib/screenshot';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff'];
const BLUR_PIXEL_SIZE = 10;

export function AnnotationEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState('#ef4444');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const activeShapeRef = useRef<fabric.FabricObject | null>(null);

  // Load screenshot from storage
  useEffect(() => {
    const init = async () => {
      const stored = await browser.storage.local.get('nobug_screenshot');
      const dataUrl = stored.nobug_screenshot as string;
      if (!dataUrl || !canvasRef.current) return;

      const img = new Image();
      img.onload = () => {
        const canvas = new fabric.Canvas(canvasRef.current!, {
          width: img.width,
          height: img.height,
          backgroundColor: '#000',
        });
        fabricRef.current = canvas;

        const bgImage = new fabric.FabricImage(img, {
          selectable: false,
          evented: false,
        });
        canvas.backgroundImage = bgImage;
        canvas.renderAll();

        saveHistory(canvas);
        setImageLoaded(true);
      };
      img.src = dataUrl;
    };
    init();

    return () => {
      fabricRef.current?.dispose();
    };
  }, []);

  const saveHistory = useCallback((canvas: fabric.Canvas) => {
    const json = JSON.stringify(canvas.toJSON());
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(json);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0 || !fabricRef.current) return;
    const newIndex = historyIndex - 1;
    fabricRef.current.loadFromJSON(history[newIndex]).then(() => {
      fabricRef.current!.renderAll();
      setHistoryIndex(newIndex);
    });
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !fabricRef.current) return;
    const newIndex = historyIndex + 1;
    fabricRef.current.loadFromJSON(history[newIndex]).then(() => {
      fabricRef.current!.renderAll();
      setHistoryIndex(newIndex);
    });
  }, [history, historyIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.close();
      } else if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.key === 'y' && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Tool drawing handlers
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !imageLoaded) return;

    // Reset canvas state for new tool
    canvas.isDrawingMode = tool === 'freehand';
    canvas.selection = tool === 'select';

    if (tool === 'freehand') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = 3;
    }

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      if (tool === 'select' || tool === 'freehand') return;
      const pointer = canvas.getScenePoint(opt.e);
      isDrawingRef.current = true;
      startPointRef.current = { x: pointer.x, y: pointer.y };

      let shape: fabric.FabricObject | null = null;

      if (tool === 'rectangle' || tool === 'blur') {
        shape = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: tool === 'blur' ? 'rgba(128,128,128,0.5)' : 'transparent',
          stroke: tool === 'blur' ? 'transparent' : color,
          strokeWidth: tool === 'blur' ? 0 : 3,
        });
      } else if (tool === 'ellipse') {
        shape = new fabric.Ellipse({
          left: pointer.x,
          top: pointer.y,
          rx: 0,
          ry: 0,
          fill: 'transparent',
          stroke: color,
          strokeWidth: 3,
        });
      } else if (tool === 'arrow') {
        shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color,
          strokeWidth: 3,
        });
      } else if (tool === 'text') {
        const text = new fabric.IText('Text', {
          left: pointer.x,
          top: pointer.y,
          fontSize: 20,
          fill: color,
          fontFamily: 'system-ui',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        saveHistory(canvas);
        return;
      }

      if (shape) {
        activeShapeRef.current = shape;
        canvas.add(shape);
      }
    };

    const onMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !startPointRef.current || !activeShapeRef.current) return;
      const pointer = canvas.getScenePoint(opt.e);
      const start = startPointRef.current;
      const shape = activeShapeRef.current;

      if (tool === 'rectangle' || tool === 'blur') {
        const rect = shape as fabric.Rect;
        rect.set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          width: Math.abs(pointer.x - start.x),
          height: Math.abs(pointer.y - start.y),
        });
      } else if (tool === 'ellipse') {
        const ellipse = shape as fabric.Ellipse;
        ellipse.set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          rx: Math.abs(pointer.x - start.x) / 2,
          ry: Math.abs(pointer.y - start.y) / 2,
        });
      } else if (tool === 'arrow') {
        const line = shape as fabric.Line;
        line.set({ x2: pointer.x, y2: pointer.y });
      }

      canvas.renderAll();
    };

    const onMouseUp = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      startPointRef.current = null;

      // For blur tool: apply pixelation effect
      if (tool === 'blur' && activeShapeRef.current) {
        const rect = activeShapeRef.current as fabric.Rect;
        applyBlurEffect(canvas, rect);
      }

      activeShapeRef.current = null;
      saveHistory(canvas);
    };

    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);

    return () => {
      canvas.off('mouse:down', onMouseDown);
      canvas.off('mouse:move', onMouseMove);
      canvas.off('mouse:up', onMouseUp);
    };
  }, [tool, color, imageLoaded, saveHistory]);

  /** Apply pixelation blur to the area under the rectangle */
  function applyBlurEffect(canvas: fabric.Canvas, rect: fabric.Rect) {
    const left = rect.left ?? 0;
    const top = rect.top ?? 0;
    const width = rect.width ?? 0;
    const height = rect.height ?? 0;

    if (width < 2 || height < 2) return;

    // Get pixel data from the canvas at the rect area
    const ctx = canvas.getContext();
    const imageData = ctx.getImageData(left, top, width, height);
    const data = imageData.data;

    // Pixelate
    for (let y = 0; y < height; y += BLUR_PIXEL_SIZE) {
      for (let x = 0; x < width; x += BLUR_PIXEL_SIZE) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        for (let dy = 0; dy < BLUR_PIXEL_SIZE && y + dy < height; dy++) {
          for (let dx = 0; dx < BLUR_PIXEL_SIZE && x + dx < width; dx++) {
            const i = ((y + dy) * width + (x + dx)) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }

    // Create an image from the pixelated data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    // Replace the blur rect with the pixelated image
    canvas.remove(rect);
    const blurImage = new fabric.FabricImage(tempCanvas, {
      left,
      top,
      selectable: true,
    });
    canvas.add(blurImage);
    canvas.renderAll();
  }

  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Export flattened PNG
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    // Export annotations JSON
    const annotationsJson = JSON.stringify(canvas.toJSON());

    // Store result for the popup/service worker to pick up
    await browser.storage.local.set({
      nobug_annotated_screenshot: dataUrl,
      nobug_annotations_json: annotationsJson,
    });

    // Notify and close
    await browser.runtime.sendMessage({ type: 'SCREENSHOT_ANNOTATED' });
    window.close();
  };

  if (!imageLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-border shrink-0">
        <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select (V)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2l10 6-5 1-2 5L3 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')} title="Arrow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13L13 3M13 3H7M13 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'rectangle'} onClick={() => setTool('rectangle')} title="Rectangle">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'ellipse'} onClick={() => setTool('ellipse')} title="Ellipse">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="8" rx="6" ry="5" stroke="currentColor" strokeWidth="1.5"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'freehand'} onClick={() => setTool('freehand')} title="Freehand">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12c2-4 4-8 6-6s-2 8 0 6 4-8 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'text'} onClick={() => setTool('text')} title="Text">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 3h8M8 3v10M6 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </ToolButton>
        <ToolButton active={tool === 'blur'} onClick={() => setTool('blur')} title="Blur/Redact">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/></svg>
        </ToolButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Color picker */}
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              color === c ? 'border-white scale-125' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Undo/Redo */}
        <ToolButton onClick={undo} title="Undo (Ctrl+Z)" active={false}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6h6a3 3 0 110 6H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 4L4 6l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </ToolButton>
        <ToolButton onClick={redo} title="Redo (Ctrl+Shift+Z)" active={false}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 6H6a3 3 0 100 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 4l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </ToolButton>

        <div className="flex-1" />

        {/* Save / Cancel */}
        <button
          onClick={() => window.close()}
          className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-md transition-colors"
        >
          Save
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-primary/20 text-primary'
          : 'text-text-secondary hover:text-text hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}
