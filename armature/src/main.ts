import './style.css';
import { App } from './ui/app';

const app = new App();
// handy for poking at the model from the console
(window as unknown as { armature: App }).armature = app;
