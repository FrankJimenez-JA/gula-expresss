# Gula Express — Primera versión (V1)

Canal de venta digital y gestión operativa de pedidos para el local de comida rápida **"Gula"**.
Universidad San Francisco Xavier de Chuquisaca · Facultad de Ciencias y Tecnología · SIS-324 Ingeniería de Software · **Grupo 10**

**Integrantes:** Juan Pablo Taboada Camacho · Juan Moises Orellana Soria · Franco Milton Jiménez Amachuy

## Qué incluye la V1

| Módulo | Requisitos cubiertos |
|---|---|
| Catálogo por categorías, disponibilidad | RF-01, RF-02 |
| Personalización (cocción, extras, quitar), combos, incompatibilidades | RF-03, RF-04, RF-05 |
| Carrito, total automático, promociones, notas | RF-06, RF-07, RF-11, RF-13 |
| Delivery / recojo / mesa, zonas y costo de envío, rechazo fuera de cobertura | RF-08, RF-09, RF-10 |
| Medio de pago, horario de atención, tiempo estimado | RF-12, RF-14, RF-15 |
| Seguimiento en tiempo real y cancelación | RF-16, RF-17 |
| Cuenta de cliente, pedido sin cuenta, direcciones guardadas, historial y repetir pedido | RF-18 a RF-21 |
| Pantalla de cocina con cola, tiempos y alerta de demora | RF-22 a RF-26 |
| Despacho por zona y vista del repartidor | RF-27 a RF-30 |
| Registro en mostrador (misma cola de cocina) | RF-31 a RF-33 |
| Administración: carta, precios, promociones, horarios, zonas, usuarios y roles | RF-34 a RF-38 |
| Reportes por canal/modalidad, más vendidos, tiempos promedio, exportar CSV | RF-39 a RF-42 |
| Contraseñas con hash + sal (scrypt), roles, pedidos sin duplicar, historial con marca de tiempo | RNF-01, RNF-02, RNF-10, RNF-11 |

Pendiente para versiones siguientes: pulido visual, imágenes reales de productos, base de datos relacional persistente (PostgreSQL), pruebas automatizadas.

## Ejecutar en local

```bash
npm install
npm start        # http://localhost:3000
```

## Rutas

- `/` tienda del cliente (móvil) · `/?canal=mostrador` registro en mostrador (requiere ingresar antes en `/staff.html`)
- `/staff.html` panel interno

## Usuarios de prueba (personal)

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | admin | admin123 |
| Vendedor | vendedor | vendedor123 |
| Cocinero | cocinero | cocinero123 |
| Repartidor | repartidor | repartidor123 |


