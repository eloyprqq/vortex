export class Input {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  lmb = false;
  rmb = false;
  lmbDown = false;
  rmbDown = false;
  locked = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onContext = this.onContext.bind(this);
    this.onLock = this.onLock.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onLock);
    canvas.addEventListener("contextmenu", this.onContext);
  }

  requestLock() {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmbDown = false;
    this.rmbDown = false;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.exitLock();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (["Space", "KeyE", "KeyQ", "KeyR"].includes(e.code)) e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      this.lmb = true;
      this.lmbDown = true;
    }
    if (e.button === 2) {
      this.rmb = true;
      this.rmbDown = true;
    }
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.lmb = false;
    if (e.button === 2) this.rmb = false;
  }

  private onContext(e: Event) {
    e.preventDefault();
  }

  private onLock() {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.lmb = false;
      this.rmb = false;
    }
  }
}
