import { mount } from 'svelte';
import Session from './Session.svelte';
import './style.css';

const target = document.getElementById('app');
if (!target) throw new Error('Área de trabalho indisponível');
mount(Session, { target });
