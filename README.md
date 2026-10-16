# Dra. Betty

App personal de finanzas con una perezosa de asistente: gastos, pagos fijos, ahorros, certificados y colchón de emergencias. Funciona en el cel y en la compu, se instala como app y guarda todo en una base de datos Postgres propia (Supabase).

**En vivo:** https://atza1117.github.io/Dra.Betty/

## Qué hace

- **Inicio**: cuánto te queda en el mes, plan contra lo real (en rojo lo que se pasa), avisos y la Dra. Betty comentando cómo vas.
- **Movimientos**: todo lo anotado, con búsqueda y filtros; tocá cualquiera para editarlo.
- **Pagos**: checklist del mes de suscripciones, recibos y universidad, con día de cobro, meses en que se cobra y botón "Este mes no". Reconoce solos los cobros que ya anotaste y te dice cuánto apartar del pago del 15 y del 30, con los dólares convertidos.
- **Gráficas**: en qué se fue la plata, los últimos 6 meses y cómo crece tu ahorro.
- **Cuentas**: saldos, botones para sacar o meter plata del ahorro sin que cuente como gasto, y certificados que se renuevan o liquidan cuando vencen.

## Cómo piensa la app

La plata vive en **cuentas** (corriente, ahorro, certificados, dólares…). Cada movimiento es una de tres cosas:

| Movimiento | Qué pasa | ¿Cuenta como gasto? |
|---|---|---|
| **Gasto** | Sale plata de una cuenta | Sí |
| **Ingreso** | Entra plata a una cuenta | — |
| **Transferencia** | Pasa de una cuenta tuya a otra tuya | **No** |

*Ahorrar* es una transferencia de la corriente al ahorro. *Sacar del colchón* es una transferencia del ahorro a la corriente. Ninguna de las dos es gasto. Si después usás esa plata, ese gasto se anota aparte.

Los saldos no se escriben a mano: la base los calcula con los movimientos (vista `saldos`). Si editás o borrás un movimiento, el saldo se corrige solo. Si no calza con el banco, en la cuenta está **Ajustar saldo**.

## Puesta en marcha (una sola vez)

### 1. La base de datos
1. Creá una cuenta gratis en [supabase.com](https://supabase.com) y un proyecto nuevo (región: *East US* es la más cercana).
2. **SQL Editor → New query**, pegá todo [`supabase/schema.sql`](supabase/schema.sql) y tocá **Run**.
3. **Authentication → URL Configuration → Site URL**: `https://atza1117.github.io/Dra.Betty/`
4. **Project Settings → API**: copiá el *Project URL* y la key *anon public* y ponelos en [`js/config.js`](js/config.js).

> La *anon key* está hecha para ir en código público: sin iniciar sesión no da acceso a nada, porque cada tabla tiene reglas (RLS) que solo dejan ver lo propio. **Nunca** pongas la *service_role key* en el repo.

### 2. Tu usuario
1. Abrí la app, escribí correo y contraseña y tocá **"Es mi primera vez: crear usuario"**.
2. Confirmá el correo que te llega.
3. *(Opcional)* Si tenés un `seed.sql` con datos para importar, corrélo ahora en el SQL Editor. **Ese archivo no va en el repo.**
4. Cerrá los registros para que nadie más pueda crear usuarios en tu base:
   **Authentication → Sign In / Providers → Email → desactivá "Allow new users to sign up"**.

### 3. Instalarla en el cel
- **Android (Chrome):** abrí el link → menú ⋮ → **Instalar app**.
- **iPhone (Safari):** abrí el link → botón Compartir → **Agregar a inicio**.

## Archivos

```
index.html            la página
styles.css            estilos
js/app.js             pantallas y formularios
js/calculos.js        cálculos puros (resumen del mes, colchón, plan, avisos)
js/lector.js          lee correos de Banco Popular y BAC pegados en la app
js/db.js              todo lo que habla con Supabase
js/config.js          URL y anon key de tu proyecto
supabase/schema.sql   tablas, vista de saldos y reglas de seguridad
sw.js                 permite instalarla y abrirla sin internet
```

No hay que compilar nada: es HTML, CSS y JavaScript plano. GitHub Pages sirve los archivos tal cual.

## Tus datos

Están en tu proyecto de Supabase. Desde ahí podés verlos como tabla (**Table Editor**), consultarlos con SQL o exportarlos a CSV. La app también tiene **Plan → Descargar movimientos (CSV)**.

> Supabase pausa los proyectos gratis después de una semana sin uso. Si pasa, entrá a supabase.com y tocá *Restore*: no se pierde nada.
