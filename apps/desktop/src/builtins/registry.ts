import { AudioLines, Clapperboard, Image, Mail, Music, BookOpen, Bookmark, ClipboardList, Calculator, CalendarRange, FileCode2, FolderOpen, Gamepad2, Globe, Mic, NotebookPen, Paintbrush } from 'lucide-svelte';
import type { BuiltinAppId } from '@eduos/desktop-core';
import type { Category } from '../StartMenu.svelte';

type App = { id: BuiltinAppId; name: string; description: string; tags: string; category: Category; icon: typeof Calculator; width: number; height: number };

export const builtinCatalog = [
  { id: 'markdown', name: 'Editor simples', description: 'Abra, edite e salve arquivos de texto e código', tags: 'código desenvolvimento markdown texto', category: 'development', icon: FileCode2, width: 630, height: 440 },
  { id: 'biblioteca', name: 'Biblioteca', description: 'Importe, leia, anote e busque seus documentos', tags: 'educação pdf docx markdown pesquisa acervo', category: 'education', icon: BookOpen, width: 900, height: 680 },
  { id: 'schedule', name: 'VibeLab Horário', description: 'Planeje e gere horários escolares na versão completa', tags: 'escola grade horário educação', category: 'education', icon: CalendarRange, width: 760, height: 480 },
  { id: 'grade-management', name: 'Gestão de Notas', description: 'Gerencie as notas escolares', tags: 'avaliação boletim turma educação', category: 'education', icon: ClipboardList, width: 900, height: 680 },
  { id: 'escola-office', name: 'Escola Office', description: 'Suíte original de escritório escolar', tags: 'texto planilha slides apresentação', category: 'office', icon: BookOpen, width: 900, height: 680 },
  { id: 'notes', name: 'Bloco de notas', description: 'Escreva e salve suas anotações', tags: 'texto escrever caderno', category: 'office', icon: NotebookPen, width: 550, height: 400 },
  { id: 'puter-notes', name: 'Notes', description: 'Organize cadernos e anotações no Puter', tags: 'notas texto escritório', category: 'office', icon: NotebookPen, width: 1100, height: 720 },
  { id: 'puter-email', name: 'Email', description: 'Envie e receba mensagens com uma conta Puter', tags: 'e-mail correio colaboração', category: 'collaboration', icon: Mail, width: 1100, height: 720 },
  { id: 'puter-photo-studio', name: 'Photo Studio', description: 'Edite imagens e fotos', tags: 'foto imagem camadas', category: 'graphics', icon: Image, width: 1100, height: 720 },
  { id: 'puter-video-studio', name: 'Video Studio', description: 'Edite e monte vídeos', tags: 'vídeo edição montagem', category: 'graphics', icon: Clapperboard, width: 1100, height: 720 },
  { id: 'puter-audio-studio', name: 'Audio Studio', description: 'Edite e misture áudio', tags: 'áudio som gravação', category: 'graphics', icon: AudioLines, width: 1100, height: 720 },
  { id: 'puter-music-studio', name: 'Music Studio', description: 'Componha e produza música', tags: 'música composição midi', category: 'graphics', icon: Music, width: 1100, height: 720 },
  { id: 'draw', name: 'Desenho Vibe', description: 'Desenhe e salve na prancheta local', tags: 'canvas arte imagem pintura', category: 'graphics', icon: Paintbrush, width: 650, height: 475 },
  { id: 'mini-browser', name: 'Mini Navegador', description: 'Navegue na web com abas e favoritos', tags: 'internet web sites pesquisa histórico', category: 'internet', icon: Globe, width: 1000, height: 720 },
  { id: 'bookmarks', name: 'Marcadores', description: 'Organize links e leia páginas HTML salvas', tags: 'internet offline links html', category: 'internet', icon: Bookmark, width: 570, height: 470 },
  { id: 'recorder', name: 'Gravador de Slam', description: 'Grave, ouça e exporte suas apresentações', tags: 'áudio voz microfone multimídia', category: 'media', icon: Mic, width: 560, height: 350 },
  { id: 'files', name: 'Arquivos · VibeLab', description: 'Organize os arquivos locais do seu perfil', tags: 'sistema pasta gerenciador arquivos', category: 'system', icon: FolderOpen, width: 620, height: 425 },
  { id: 'jogo-dos-pontinhos', name: 'Jogo dos Pontinhos', description: 'Ligue os pontos e crie desenhos', tags: 'jogo desenho criatividade', category: 'games', icon: Gamepad2, width: 1000, height: 720 },
  { id: 'quadro-de-poesia', name: 'Quadro Magnético de Poesia', description: 'Componha poemas com palavras imantadas', tags: 'jogo poesia escrita palavras', category: 'games', icon: NotebookPen, width: 1000, height: 720 },
  { id: 'calculator', name: 'Calculadora', description: 'Faça operações básicas', tags: 'matemática contas cálculo', category: 'utilities', icon: Calculator, width: 355, height: 425 },
] as const satisfies readonly App[];
