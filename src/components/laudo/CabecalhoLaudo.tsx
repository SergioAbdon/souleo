'use client';
// Cabeçalho azul-marinho da coluna do laudo (spec 2026-10-11-coluna-laudo-
// unificada): "Tipo do exame · Clínica", médico/CRM e o Voltar dentro dele.
// Mesmo bloco pra ECO, laudo de texto e qualquer laudo futuro. Estilos em
// globals.css (.laudo-cabecalho*).
import EditorIcon from './EditorIcon';

type Props = {
  titulo: string;
  clinicaNome: string;
  medicoInfo: string;
  onVoltar: () => void;
};

export default function CabecalhoLaudo({ titulo, clinicaNome, medicoInfo, onVoltar }: Props) {
  return (
    <div className="laudo-cabecalho">
      <div className="min-w-0">
        <h1>{titulo} · <span id="hdr-clinica">{clinicaNome}</span></h1>
        <p id="hdr-subtitulo">{medicoInfo}</p>
      </div>
      <button type="button" onClick={onVoltar} aria-label="Voltar para a agenda" className="laudo-cabecalho-voltar">
        <EditorIcon name="back" /> Voltar
      </button>
    </div>
  );
}
