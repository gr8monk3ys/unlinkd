import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './OnboardingWizard';

function renderWizard(overrides: Partial<Parameters<typeof OnboardingWizard>[0]> = {}) {
  const props = {
    onAddIdentifiers: vi
      .fn<Parameters<typeof OnboardingWizard>[0]['onAddIdentifiers']>()
      .mockImplementation((items) => Promise.resolve(items.length)),
    onImportAccounts: vi.fn(),
    onAddConnectors: vi
      .fn<Parameters<typeof OnboardingWizard>[0]['onAddConnectors']>()
      .mockImplementation((ids) => Promise.resolve(ids.length)),
    onComplete: vi.fn(),
    ...overrides
  };

  render(<OnboardingWizard {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OnboardingWizard', () => {
  it('renders step 1 with the welcome message', () => {
    renderWizard();

    expect(screen.getByText('Welcome to unlinkd')).toBeInTheDocument();
    expect(
      screen.getByText(/unlinkd helps you discover and reduce your digital exposure/)
    ).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
  });

  it('advances from step 1 to step 2 when "Get Started" is clicked', () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('Quick Identity Scan')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary email')).toBeInTheDocument();
  });

  it('advances through all steps using skip buttons', () => {
    const props = renderWizard();

    // Step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();

    // Step 2 -> 3 (Skip)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByText('Import Accounts')).toBeInTheDocument();

    // Step 3 -> 4 (Skip)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();
    expect(screen.getByText('Suggested Actions')).toBeInTheDocument();

    // Step 4 -> 5 (Skip)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    expect(screen.getByText('Setup Complete')).toBeInTheDocument();

    // None of the action callbacks should have been called when skipping
    expect(props.onAddIdentifiers).not.toHaveBeenCalled();
    expect(props.onImportAccounts).not.toHaveBeenCalled();
    expect(props.onAddConnectors).not.toHaveBeenCalled();
  });

  it('calls onAddIdentifiers with correct data when identifiers are entered', async () => {
    const props = renderWizard();

    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    // Fill in identifiers
    fireEvent.change(screen.getByLabelText('Primary email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Phone number/), {
      target: { value: '+15551234567' }
    });
    fireEvent.change(screen.getByLabelText(/Legal name/), {
      target: { value: 'Jane Doe' }
    });
    fireEvent.change(screen.getByLabelText(/Primary username/), {
      target: { value: 'janedoe42' }
    });

    // Click "Add These"
    fireEvent.click(screen.getByRole('button', { name: 'Add These' }));

    await waitFor(() => {
      expect(props.onAddIdentifiers).toHaveBeenCalledOnce();
    });

    expect(props.onAddIdentifiers).toHaveBeenCalledWith([
      { type: 'email', value: 'test@example.com' },
      { type: 'phone', value: '+15551234567' },
      { type: 'legal_name', value: 'Jane Doe' },
      { type: 'username', value: 'janedoe42' }
    ]);

    // Should advance to step 3
    await waitFor(() => {
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    });
  });

  it('calls onAddIdentifiers with only filled fields', async () => {
    const props = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    // Fill only email
    fireEvent.change(screen.getByLabelText('Primary email'), {
      target: { value: 'test@example.com' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add These' }));

    await waitFor(() => {
      expect(props.onAddIdentifiers).toHaveBeenCalledOnce();
    });

    expect(props.onAddIdentifiers).toHaveBeenCalledWith([
      { type: 'email', value: 'test@example.com' }
    ]);
  });

  it('does not call onAddIdentifiers when all fields are empty and "Add These" is clicked', async () => {
    const props = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add These' }));

    await waitFor(() => {
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    });

    expect(props.onAddIdentifiers).not.toHaveBeenCalled();
  });

  it('calls onImportAccounts when a file is selected and "Import" is clicked', () => {
    const props = renderWizard();

    // Navigate to step 3
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();

    // Create a mock CSV file
    const csvFile = new File(['service,username,url\nGitHub,janedoe,https://github.com'], 'passwords.csv', {
      type: 'text/csv'
    });

    const fileInput = screen.getByLabelText('Password manager CSV');
    fireEvent.change(fileInput, { target: { files: [csvFile] } });

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(props.onImportAccounts).toHaveBeenCalledOnce();
    expect(props.onImportAccounts).toHaveBeenCalledWith(csvFile);

    // Should advance to step 4
    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();
  });

  it('does not call onImportAccounts when no file is selected', () => {
    const props = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(props.onImportAccounts).not.toHaveBeenCalled();
    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();
  });

  it('calls onAddConnectors with selected connector IDs', () => {
    const props = renderWizard();

    // Navigate to step 4
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();

    // The always-present connectors should be visible
    expect(screen.getByText(/US Credit Freeze/)).toBeInTheDocument();
    expect(screen.getByText(/Email Aliasing/)).toBeInTheDocument();

    // Select some connectors
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    fireEvent.click(screen.getByRole('button', { name: 'Add Selected' }));

    expect(props.onAddConnectors).toHaveBeenCalledOnce();
    const calledWith = props.onAddConnectors.mock.calls[0]![0] as string[];
    expect(calledWith).toHaveLength(2);
  });

  it('calls onComplete when "Go to Dashboard" is clicked on step 5', () => {
    const props = renderWizard();

    // Navigate to step 5
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Setup Complete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));

    expect(props.onComplete).toHaveBeenCalledOnce();
  });

  it('shows summary of skipped items on step 5', () => {
    renderWizard();

    // Skip everything
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText(/No identifiers added/)).toBeInTheDocument();
    expect(screen.getByText(/No accounts imported/)).toBeInTheDocument();
    expect(screen.getByText(/No connectors added/)).toBeInTheDocument();
  });

  it('shows summary of added items on step 5', async () => {
    renderWizard();

    // Step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    // Add email identifier
    fireEvent.change(screen.getByLabelText('Primary email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add These' }));

    await waitFor(() => {
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    });

    // Skip import
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Add a connector
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add Selected' }));

    // Step 5 summary reflects the counts the handlers actually reported.
    expect(await screen.findByText('1 identifier added.')).toBeInTheDocument();
    expect(screen.getByText(/1 connector workflow added/)).toBeInTheDocument();
  });

  it('shows contextual connector suggestions based on entered identifiers', async () => {
    renderWizard();

    // Step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    // Enter phone number to trigger SIM swap suggestion
    fireEvent.change(screen.getByLabelText(/Phone number/), {
      target: { value: '+15551234567' }
    });

    // Enter email to trigger Google search suggestion
    fireEvent.change(screen.getByLabelText('Primary email'), {
      target: { value: 'test@example.com' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add These' }));

    await waitFor(() => {
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    });

    // Skip import
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Step 4: should show phone-triggered and email-triggered suggestions
    expect(screen.getByText('SIM Swap Protection (Carrier Lock)')).toBeInTheDocument();
    expect(screen.getByText('Google Search (Self-Search + Tracking)')).toBeInTheDocument();
    expect(screen.getByText('Whitepages (Opt-out)')).toBeInTheDocument();
    expect(screen.getByText('Spokeo (Opt-out)')).toBeInTheDocument();
  });

  it('has data-step attribute matching current step', () => {
    const { container } = render(
      <OnboardingWizard
        onAddIdentifiers={vi.fn().mockResolvedValue(undefined)}
        onImportAccounts={vi.fn()}
        onAddConnectors={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('data-step')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(wrapper.getAttribute('data-step')).toBe('2');
  });
});
