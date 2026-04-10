import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollaboratorFormDialog } from './CollaboratorFormDialog'

const noop = () => {}

describe('CollaboratorFormDialog', () => {
  it('renders create form with empty fields', () => {
    render(
      <CollaboratorFormDialog
        open={true}
        onOpenChange={noop}
        collaborator={null}
        onSuccess={noop}
      />,
    )

    expect(screen.getByText('Novo Colaborador')).toBeInTheDocument()
    expect(screen.getByLabelText(/nome completo/i)).toHaveValue('')
    expect(screen.getByLabelText(/aliases/i)).toHaveValue('')
    expect(screen.getByLabelText(/cargo/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: /criar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('shows validation error on empty name', async () => {
    const user = userEvent.setup()
    render(
      <CollaboratorFormDialog
        open={true}
        onOpenChange={noop}
        collaborator={null}
        onSuccess={noop}
      />,
    )

    // Clear the name field to be sure and submit
    const nameInput = screen.getByLabelText(/nome completo/i)
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /criar/i }))

    await waitFor(() => {
      expect(screen.getByText(/nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('renders edit form with pre-filled fields', () => {
    const collaborator = {
      id: 1,
      full_name: 'Ana Silva',
      aliases: ['Aninha', 'Ana S'],
      department: 'E-notariado',
      position: 'Atendente',
      is_active: true,
      mention_count: 12,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    }

    render(
      <CollaboratorFormDialog
        open={true}
        onOpenChange={noop}
        collaborator={collaborator}
        onSuccess={noop}
      />,
    )

    expect(screen.getByText('Editar Colaborador')).toBeInTheDocument()
    expect(screen.getByLabelText(/nome completo/i)).toHaveValue('Ana Silva')
    expect(screen.getByLabelText(/aliases/i)).toHaveValue('Aninha; Ana S')
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
  })
})
