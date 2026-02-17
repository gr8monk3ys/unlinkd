import { useState } from 'react';
import type { Identifier, IdentifierType } from '../../core/types';

const identifierTypes: IdentifierType[] = ['email', 'phone', 'username', 'address', 'legal_name', 'device'];

interface IdentifiersTabProps {
  personaIdentifiers: Identifier[];
  onAddIdentifier: (type: IdentifierType, value: string, allowCrossPersonaReuse: boolean) => Promise<boolean>;
}

export function IdentifiersTab({ personaIdentifiers, onAddIdentifier }: IdentifiersTabProps): React.JSX.Element {
  const [idType, setIdType] = useState<IdentifierType>('email');
  const [idValue, setIdValue] = useState('');
  const [allowCrossPersonaReuse, setAllowCrossPersonaReuse] = useState(false);

  return (
    <section>
      <h2>Identifiers</h2>
      <label htmlFor="identifier-type">Type</label>
      <select id="identifier-type" value={idType} onChange={(event) => setIdType(event.target.value as IdentifierType)}>
        {identifierTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <label htmlFor="identifier-value">Value</label>
      <input
        id="identifier-value"
        value={idValue}
        onChange={(event) => setIdValue(event.target.value)}
        placeholder="enter identifier"
      />
      <label>
        <input
          type="checkbox"
          checked={allowCrossPersonaReuse}
          onChange={(event) => setAllowCrossPersonaReuse(event.target.checked)}
        />
        Allow cross-persona reuse
      </label>
      <button
        type="button"
        onClick={() =>
          void onAddIdentifier(idType, idValue, allowCrossPersonaReuse).then((ok) => {
            if (ok) {
              setIdValue('');
            }
          })
        }
      >
        Add Identifier
      </button>
      <ul>
        {personaIdentifiers.map((identifier) => (
          <li key={identifier.id}>{`${identifier.type}: ${identifier.value}`}</li>
        ))}
      </ul>
    </section>
  );
}
