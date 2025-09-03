'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Search, Star, MessageSquare } from 'lucide-react'

interface Collaborator {
  id: number
  full_name: string
  department: string
  position: string
  is_active: boolean
  mentions?: number
  avgRating?: number
  positiveMentions?: number
  negativeMentions?: number
}

interface CollaboratorsTableProps {
  collaborators: Collaborator[]
}

export function CollaboratorsTable({ collaborators }: CollaboratorsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredCollaborators = collaborators.filter(collab =>
    collab.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    collab.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
    collab.position.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Colaboradores Monitorados</span>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Departamento</th>
                <th className="text-left p-2">Cargo</th>
                <th className="text-center p-2">Menções</th>
                <th className="text-center p-2">Rating Médio</th>
                <th className="text-center p-2">Sentimento</th>
                <th className="text-center p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCollaborators.map((collab) => (
                <tr key={collab.id} className="border-b hover:bg-muted/50">
                  <td className="p-2">
                    <div className="font-medium">{collab.full_name}</div>
                  </td>
                  <td className="p-2">
                    <Badge variant="outline">{collab.department}</Badge>
                  </td>
                  <td className="p-2 text-sm text-muted-foreground">
                    {collab.position}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      <span>{collab.mentions || 0}</span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>{collab.avgRating?.toFixed(1) || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      {collab.positiveMentions !== undefined && (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          +{collab.positiveMentions}
                        </Badge>
                      )}
                      {collab.negativeMentions !== undefined && collab.negativeMentions > 0 && (
                        <Badge variant="destructive">
                          -{collab.negativeMentions}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <Badge variant={collab.is_active ? "default" : "secondary"}>
                      {collab.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCollaborators.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum colaborador encontrado.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
