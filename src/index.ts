import Renderer from "./renderer";
import { Fluid, FluidConfig } from "./fluid";

const fluidConfig = new FluidConfig(100, 1, 0.3);
const fluid = new Fluid(fluidConfig);
let renderer = new Renderer(fluid);
renderer.start();
