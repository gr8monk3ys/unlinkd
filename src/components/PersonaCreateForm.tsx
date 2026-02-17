import { useState } from 'react';

interface PersonaCreateFormProps {
  onCreate: (name: string) => void;
}

export function PersonaCreateForm({ onCreate }: PersonaCreateFormProps): React.JSX.Element {
  const [name, setName] = useState('');

  return (
    <section>
      <h3>Create Persona</h3>
      <label htmlFor="persona-name">Name</label>
      <input id="persona-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Personal, Work, Pseudonymous" />
      <button
        type="button"
        onClick={() => {
          const trimmed = name.trim();
          if (!trimmed) {
            return;
          }

          onCreate(trimmed);
          setName('');
        }}
      >
        Create
      </button>
    </section>
  );
}
