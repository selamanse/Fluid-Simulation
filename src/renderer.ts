import { Fluid } from "./fluid";
import {
  createProgram,
  createShader,
  m3,
  resizeCanvasToDisplaySize,
  getEventLocation,
  round,
  getMultipliers,
} from "./utils";

export default class Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  //   private resetButton: HTMLButtonElement;
  private modeButton: HTMLButtonElement;
  private mode = 0;
  private vertices: Float32Array;
  private fluid: Fluid;
  private densityPerVertex: Float32Array;
  private velocityPerVertex: Float32Array;
  private then = 0;
  private defaultMouseEventState = {
    mouseDown: false,
    dragging: false,
    pos: {
      x: 0,
      y: 0,
    },
  };
  mouseEventState = {
    ...this.defaultMouseEventState,
  };
  private webglData: {
    locations: {
      positionAttributeLocation: number | null;
      densityAttributeLocation: number | null;
      velocityAttributeLocation: number | null;
    };
    buffers: {
      positionBuffer: WebGLBuffer | null;
      densityBuffer: WebGLBuffer | null;
      velocityBuffer: WebGLBuffer | null;
    };
  };

  constructor(fluid: Fluid) {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.gl = this.canvas.getContext("webgl");
    resizeCanvasToDisplaySize(this.gl.canvas);
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.modeButton = document.getElementById("mode") as HTMLButtonElement;
    this.modeButton.innerHTML = "All";
    this.modeButton.onclick = () => {
      if (this.mode < 2) {
        this.mode += 1;
      } else {
        this.mode = 0;
      }
      if (this.mode === 0) {
        this.modeButton.innerHTML = "All";
      } else if (this.mode === 1) {
        this.modeButton.innerHTML = "Velocity";
      } else if (this.mode === 2) {
        this.modeButton.innerHTML = "Density";
      }
    };

    // this.resetButton = document.getElementById("reset") as HTMLButtonElement;
    this.fluid = fluid;
    this.vertices = new Float32Array(fluid.size * 12);
    this.densityPerVertex = new Float32Array(fluid.size * 6);
    this.webglData = {
      locations: {
        positionAttributeLocation: null,
        densityAttributeLocation: null,
        velocityAttributeLocation: null,
      },
      buffers: {
        positionBuffer: null,
        densityBuffer: null,
        velocityBuffer: null,
      },
    };
    this.addEventHandlers();
    this.initializeWebGL();
  }

  addV(y: number, x: number, e: MouseEvent) {
    // let amtX = x - Math.abs(this.mouseEventState.pos.x);
    // let amtY = y - Math.abs(this.mouseEventState.pos.y);

    // console.log(x, y);

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const eventY = e.clientX - rect.left; //x position within the element.
    const eventX = e.clientY - rect.top; //y position within the element.
    let prevPos = this.mouseEventState.pos;
    const [multiX, multiY] = getMultipliers(
      prevPos.x,
      prevPos.y,
      eventX,
      eventY
    );
    this.fluid.addVelocity(
      this.fluid.ix(x, y),
      Math.random() * 1000 * multiX,
      Math.random() * 1000 * multiY
    );
    this.storeEventLocation(e);
  }

  addD(y: number, x: number) {
    this.fluid.addDensity(
      this.fluid.ix(x, y),
      Math.floor(Math.random() * (5 - 1 + 1)) + 1
    );
  }

  storeEventLocation(e: MouseEvent) {
    // UPDATE THIS
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left; //x position within the element.
    const y = e.clientY - rect.top; //y position within the element.
    this.mouseEventState.pos = {
      x: y,
      y: x,
    };
  }

  handleEvent = (x: number, y: number, e: MouseEvent) => {
    if (this.mode === 0) {
      this.addV(x, y, e);
      this.addD(x, y);
    } else if (this.mode === 1) {
      this.addV(x, y, e);
    } else if (this.mode === 2) {
      this.addD(x, y);
    }

    // this.mouseEventState.pos.x = y;
    // this.mouseEventState.pos.y = x;
    // this.fluid.simulate();
  };

  addEventHandlers() {
    const n = this.fluid.config.n;
    this.canvas.addEventListener("mousedown", (e) => {
      this.mouseEventState = { ...this.mouseEventState, mouseDown: true };
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.mouseEventState.mouseDown) {
        this.mouseEventState = { ...this.mouseEventState, dragging: true };
        this.handleEvent(...getEventLocation(e, n), e);
      }
    });

    this.canvas.addEventListener("click", (e) => {
      this.handleEvent(...getEventLocation(e, n), e);
    });

    this.canvas.addEventListener("mouseup", () => {
      this.mouseEventState = { ...this.defaultMouseEventState };
    });
  }

  private initializeWebGL() {
    const vsGLSL: string = `
    attribute vec2 a_position;
    attribute float a_density;
  
    // This matrix is only responsible for converting my pixel coords to clipspace
    uniform mat3 u_matrix;
  
    varying float v_density;
  
    void main() {
        vec2 position = (u_matrix * vec3(a_position, 1)).xy;
        gl_Position = vec4(position, 0, 1);
        v_density = a_density;
    }
  `;

    const fsGLSL: string = `
    precision mediump float;
  
    varying float v_density;
  
    void main() {
      gl_FragColor = vec4(v_density * 0.2, v_density * 0.1, v_density * 0.5, 1);
    }
  `;

    const vertexShader = createShader(this.gl, this.gl.VERTEX_SHADER, vsGLSL);

    const fragmentShader = createShader(
      this.gl,
      this.gl.FRAGMENT_SHADER,
      fsGLSL
    );

    const program = createProgram(this.gl, vertexShader, fragmentShader);

    this.webglData.locations.positionAttributeLocation =
      this.gl.getAttribLocation(program, "a_position");

    this.webglData.locations.densityAttributeLocation =
      this.gl.getAttribLocation(program, "a_density");

    const transformationMatrixLocation = this.gl.getUniformLocation(
      program,
      "u_matrix"
    );

    this.webglData.buffers.positionBuffer = this.gl.createBuffer();

    this.webglData.buffers.densityBuffer = this.gl.createBuffer();

    this.gl.useProgram(program);

    this.gl.uniformMatrix3fv(
      transformationMatrixLocation,
      false,
      m3.projection(this.gl.canvas.width, this.gl.canvas.width)
    );

    this.populateVertices();
  }

  private populateVertices() {
    let pointIndex = 0;
    let n = this.fluid.config.n;
    const halfSquare = this.gl.canvas.width / (n + 2) / 2;
    for (let i = 0; i < n + 2; i++) {
      for (let j = 0; j < n + 2; j++) {
        const center = [
          halfSquare * 2 * i + halfSquare,
          halfSquare * 2 * j + halfSquare,
        ];

        // Vertex 1 coords
        this.vertices[pointIndex] = center[0] - halfSquare;
        this.vertices[pointIndex + 1] = center[1] - halfSquare;

        // Vertex 2 coords
        this.vertices[pointIndex + 2] = center[0] + halfSquare;
        this.vertices[pointIndex + 3] = center[1] - halfSquare;

        // Vertex 3 coords
        this.vertices[pointIndex + 4] = center[0] - halfSquare;
        this.vertices[pointIndex + 5] = center[1] + halfSquare;

        // Vertex 4 coords
        this.vertices[pointIndex + 6] = center[0] - halfSquare;
        this.vertices[pointIndex + 7] = center[1] + halfSquare;

        // Vertex 5 coords
        this.vertices[pointIndex + 8] = center[0] + halfSquare;
        this.vertices[pointIndex + 9] = center[1] - halfSquare;

        // Vertex 6 coords
        this.vertices[pointIndex + 10] = center[0] + halfSquare;
        this.vertices[pointIndex + 11] = center[1] + halfSquare;

        pointIndex += 12;
      }
    }
  }

  private render() {
    this.fluid.simulate();
    let n = this.fluid.config.n;
    let size = this.fluid.size;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        const index = this.fluid.ix(i, j);
        // const vx = this.fluid.get_velocity_X(index);
        // const vy = this.fluid.get_velocity_y(index);
        // if (vx !== 0 && vy !== 0) {
        //   console.log(vx, vy);
        // }
        for (let i = index * 6; i < index * 6 + 6; i++) {
          this.densityPerVertex[i] = this.fluid.getDensityAtIndex(index) * 100;
        }
      }
    }
    this.gl.bindBuffer(
      this.gl.ARRAY_BUFFER,
      this.webglData.buffers.positionBuffer
    );
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      this.vertices,
      this.gl.STATIC_DRAW
    );

    this.gl.bindBuffer(
      this.gl.ARRAY_BUFFER,
      this.webglData.buffers.densityBuffer
    );
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      this.densityPerVertex,
      this.gl.STATIC_DRAW
    );

    this.gl.bindBuffer(
      this.gl.ARRAY_BUFFER,
      this.webglData.buffers.positionBuffer
    );
    this.gl.enableVertexAttribArray(
      this.webglData.locations.positionAttributeLocation
    );
    this.gl.vertexAttribPointer(
      this.webglData.locations.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(
      this.gl.ARRAY_BUFFER,
      this.webglData.buffers.densityBuffer
    );
    this.gl.enableVertexAttribArray(
      this.webglData.locations.densityAttributeLocation
    );
    this.gl.vertexAttribPointer(
      this.webglData.locations.densityAttributeLocation,
      1,
      this.gl.FLOAT,
      true,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6 * size);
  }
  private draw(now: number) {
    now *= 0.001;
    // Subtract the next time from the current time
    // this.fluid.set_dt(now - this.then);
    // Remember the current time for the next frame.
    this.then = now;
    this.render();
    requestAnimationFrame(this.draw.bind(this));
  }

  start() {
    setInterval(() => {
      console.log("DENSITY", this.fluid.getDensity());
      console.log("VELOCITY X", this.fluid.getVelocityX());
      // console.log(
      //   this.fluid.get_density_expensive().map((s) => formatDec(s) / 10)
      // );
    }, 4000);
    requestAnimationFrame(this.draw.bind(this));
  }
}