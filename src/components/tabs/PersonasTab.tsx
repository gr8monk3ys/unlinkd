import type { Persona } from '../../core/types';
import { PersonaCreateForm } from '../PersonaCreateForm';

interface PersonasTabProps {
  personas: Persona[];
  activePersonaId: string;
  onSetActivePersona: (personaId: string) => void;
  onAddPersona: (name: string) => void;
}

export function PersonasTab({ personas, activePersonaId, onSetActivePersona, onAddPersona }: PersonasTabProps): React.JSX.Element {
  return (
    <section>
      <h2>Personas</h2>
      <ul>
        {personas.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onSetActivePersona(p.id)}>
              {p.id === activePersonaId ? `Active: ${p.name}` : p.name}
            </button>
          </li>
        ))}
      </ul>
      <PersonaCreateForm onCreate={onAddPersona} />
    </section>
  );
}
