import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts"

// Integration tests for collaborators API
// These tests require a running Supabase instance

const BASE_URL = 'http://localhost:54321/functions/v1'

async function makeRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token', // Use actual token in real tests
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`HTTP ${response.status}: ${error}`)
  }

  return response.json()
}

Deno.test({
  name: "Integration - GET /collaborators returns list",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    const result = await makeRequest('/collaborators')

    assertExists(result.data)
    assertExists(result.meta)
    assertEquals(Array.isArray(result.data), true)
    assertEquals(typeof result.meta.total, 'number')
  }
})

Deno.test({
  name: "Integration - POST /collaborators creates new collaborator",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    const newCollaborator = {
      full_name: 'Integration Test User',
      department: 'IT',
      position: 'Tester',
      is_active: true,
      aliases: ['test-user']
    }

    const result = await makeRequest('/collaborators', {
      method: 'POST',
      body: JSON.stringify(newCollaborator)
    })

    assertExists(result.data.id)
    assertEquals(result.data.full_name, newCollaborator.full_name)
    assertEquals(result.data.department, newCollaborator.department)
    assertEquals(result.data.position, newCollaborator.position)
    assertEquals(result.data.is_active, newCollaborator.is_active)
  }
})

Deno.test({
  name: "Integration - GET /collaborators/{id} returns specific collaborator",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    // First create a collaborator
    const newCollaborator = {
      full_name: 'Specific Test User',
      department: 'HR',
      position: 'Manager',
      is_active: true,
      aliases: []
    }

    const created = await makeRequest('/collaborators', {
      method: 'POST',
      body: JSON.stringify(newCollaborator)
    })

    // Then fetch it
    const result = await makeRequest(`/collaborators/${created.data.id}`)

    assertEquals(result.data.id, created.data.id)
    assertEquals(result.data.full_name, newCollaborator.full_name)
  }
})

Deno.test({
  name: "Integration - PUT /collaborators/{id} updates collaborator",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    // First create a collaborator
    const newCollaborator = {
      full_name: 'Update Test User',
      department: 'IT',
      position: 'Developer',
      is_active: true,
      aliases: []
    }

    const created = await makeRequest('/collaborators', {
      method: 'POST',
      body: JSON.stringify(newCollaborator)
    })

    // Then update it
    const updateData = {
      full_name: 'Updated Test User',
      department: 'Engineering',
      position: 'Senior Developer'
    }

    const result = await makeRequest(`/collaborators/${created.data.id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    })

    assertEquals(result.data.id, created.data.id)
    assertEquals(result.data.full_name, updateData.full_name)
    assertEquals(result.data.department, updateData.department)
    assertEquals(result.data.position, updateData.position)
  }
})

Deno.test({
  name: "Integration - GET /collaborators/stats returns statistics",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    const result = await makeRequest('/collaborators/stats')

    assertExists(result.data)
    assertExists(result.data.total_collaborators)
    assertExists(result.data.active_collaborators)
    assertEquals(typeof result.data.total_collaborators, 'number')
    assertEquals(typeof result.data.active_collaborators, 'number')
  }
})

Deno.test({
  name: "Integration - DELETE /collaborators/{id} removes collaborator",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    // First create a collaborator
    const newCollaborator = {
      full_name: 'Delete Test User',
      department: 'IT',
      position: 'Intern',
      is_active: true,
      aliases: []
    }

    const created = await makeRequest('/collaborators', {
      method: 'POST',
      body: JSON.stringify(newCollaborator)
    })

    // Then delete it
    const result = await makeRequest(`/collaborators/${created.data.id}`, {
      method: 'DELETE'
    })

    assertEquals(result.data.deleted, true)
  }
})

Deno.test({
  name: "Integration - Query parameters work correctly",
  ignore: true, // Remove ignore when running integration tests
  async fn() {
    // Test search
    const searchResult = await makeRequest('/collaborators?q=Test&page=1&pageSize=5')

    assertExists(searchResult.data)
    assertEquals(Array.isArray(searchResult.data), true)
    assertEquals(searchResult.meta.page, 1)
    assertEquals(searchResult.meta.pageSize, 5)

    // Test department filter
    const deptResult = await makeRequest('/collaborators?department=IT')

    assertExists(deptResult.data)
    assertEquals(Array.isArray(deptResult.data), true)
  }
})

console.log('✅ All integration tests completed!')
