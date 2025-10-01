import { Copyright } from 'renoun'

export function Basic() {
  return <Copyright />
}

export function HideLabel() {
  return (
    <div style={{ display: 'flex' }}>
      <Copyright showLabel={false} /> souporserious
    </div>
  )
}

export function StartYear() {
  return (
    <div style={{ display: 'flex' }}>
      <Copyright startYear={2024} /> renoun
    </div>
  )
}
