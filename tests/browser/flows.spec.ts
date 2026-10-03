import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
test('Compra, venta, crédito, abono, devolución, entrega y cierre en la interfaz', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('Error de navegador:', e.message);
  });
  page.setDefaultTimeout(20000);
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('admin@pruebas.local');
  await page.getByLabel('Contraseña').fill('Pruebas-locales-2026');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Nombre del negocio').fill('Ferretería de pruebas locales');
  await page.getByRole('button', { name: 'Crear mi negocio' }).click();
  await expect(page.getByRole('heading', { name: 'Un buen día empieza en orden.' })).toBeVisible();
  const nav = async (label: string) => {
    await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
  };
  await nav('Productos');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  let dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Código interno').fill('TOR-100');
  await dialog.getByLabel('Nombre del producto').fill('Tornillo galvanizado');
  await dialog.getByLabel('Precio público por unidad base').fill('2');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Tornillo galvanizado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Fotografía del producto').setInputFiles('public/icon-192.png');
  await expect(dialog.getByText('Archivo guardado.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.product-cell img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.product-cell img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Presentaciones', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Caja de 100');
  await dialog.getByLabel('Unidades base por presentación').fill('100');
  await dialog.getByLabel('Precio público por presentación').fill('200');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await nav('Proveedores');
  await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Proveedor de prueba');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await nav('Clientes');
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Cliente de prueba');
  await dialog.getByLabel('Límite de crédito').fill('1000');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await nav('Caja y bancos');
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Caja de efectivo').selectOption({ label: 'Caja principal' });
  await dialog.getByLabel('Fondo inicial contado').fill('100');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await nav('Compras');
  await page.getByRole('button', { name: 'Nueva orden' }).click();
  await page
    .getByLabel('Proveedor', { exact: true })
    .selectOption({ label: 'Proveedor de prueba' });
  await page
    .getByLabel('Presentación de Tornillo galvanizado')
    .selectOption({ label: 'Caja de 100' });
  await page.getByRole('button', { name: 'Agregar Tornillo galvanizado' }).click();
  await page.getByLabel('Precio de Tornillo galvanizado').fill('100');
  await expect(page.getByRole('button', { name: 'Crear orden', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Crear orden', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Confirmar orden', exact: true }).click();
  await page
    .locator('dialog[open]')
    .last()
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Recibir', exact: true }).click();
  await page
    .locator('dialog[open]')
    .last()
    .getByLabel(/Cantidad a recibir/)
    .fill('100');
  await page
    .locator('dialog[open]')
    .last()
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(dialog.getByRole('cell', { name: '100', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click();
  await nav('Punto de venta');
  await page.getByRole('button', { name: 'Agregar Tornillo galvanizado' }).click();
  await page.getByLabel('Cantidad de Tornillo galvanizado').fill('15');
  await page.getByLabel('Importe pago 1').fill('30');
  await expect(page.getByRole('button', { name: 'Confirmar venta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: /Venta #/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click();
  await nav('Productos');
  await expect(page.locator('tbody tr').first()).toContainText('85');
  await nav('Punto de venta');
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente de prueba' });
  await page.getByRole('button', { name: 'Agregar Tornillo galvanizado' }).click();
  await page.getByLabel('Cantidad de Tornillo galvanizado').fill('5');
  await page.getByLabel('Venta a crédito / anticipo').check();
  await page.getByLabel('Entregar posteriormente').check();
  await page.getByLabel('Dirección y contacto').fill('Entrega local');
  await expect(page.getByRole('button', { name: 'Confirmar venta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  let sub = page.locator('dialog[open]').last();
  await sub.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Caja principal' });
  await sub.getByLabel('Abono', { exact: true }).fill('4');
  await sub.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.locator('.document-totals')).toContainText('6.00');
  await dialog.getByRole('button', { name: 'Entregar', exact: true }).click();
  sub = page.locator('dialog[open]').last();
  await sub.getByLabel(/Cantidad entregada/).fill('3');
  await sub.getByLabel('Persona que recibe / constancia').fill('Cliente');
  await sub.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Devolver', exact: true }).click();
  sub = page.locator('dialog[open]').last();
  await sub.getByLabel('Cantidad a devolver en unidad base').fill('1');
  await sub.getByLabel('Motivo de devolución').fill('Pieza no utilizada');
  await sub
    .getByLabel('Cuenta del reembolso (si corresponde)')
    .selectOption({ label: 'Caja principal' });
  await sub.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.locator('.document-totals')).toContainText('4.00');
  await dialog.getByRole('button', { name: 'Garantía', exact: true }).click();
  sub = page.locator('dialog[open]').last();
  await sub.getByLabel('Descripción del caso').fill('Revisión del producto de prueba');
  await sub.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Garantías', exact: true }).click();
  await expect(dialog.getByText('Revisión del producto de prueba')).toBeVisible();
  await dialog.getByRole('button', { name: 'Actualizar caso' }).click();
  sub = page.locator('dialog[open]').last();
  await sub.getByLabel('Estado', { exact: true }).selectOption('resolved');
  await sub.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByText('Resuelto', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Pagos y recibos' }).click();
  const receiptLink = dialog.getByRole('link', { name: 'Recibo', exact: true }).first();
  await expect(receiptLink).toBeVisible();
  const receiptPage = await page.context().newPage();
  await receiptPage.goto((await receiptLink.getAttribute('href'))!);
  await expect(
    receiptPage.getByRole('heading', { name: 'Recibo de cobro', exact: true }),
  ).toBeVisible();
  await expect(receiptPage.getByRole('heading', { name: 'Total: C$ 4.00' })).toBeVisible();
  await receiptPage.close();
  const printPage = await page.context().newPage();
  await printPage.goto(
    (await dialog.getByRole('link', { name: 'Imprimir', exact: true }).getAttribute('href'))!,
  );
  await printPage.emulateMedia({ media: 'print' });
  await expect(printPage.getByRole('heading', { name: /Comprobante de venta/ })).toBeVisible();
  await expect(printPage.locator('tbody tr')).toHaveCount(1);
  await printPage.screenshot({ path: 'test-results/print-a4.png', fullPage: true });
  await printPage.close();
  const pdfUrl = await dialog.getByRole('link', { name: 'PDF', exact: true }).getAttribute('href');
  const pdf = await page.request.get(pdfUrl!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  const businessId = new URL(pdfUrl!, 'http://localhost').searchParams.get('business');
  const ticketSettings = await page.request.post('/api/command', {
    data: {
      business_id: businessId,
      request_id: crypto.randomUUID(),
      action: 'settings.save',
      data: {
        name: 'Ferretería de pruebas locales',
        currency: 'C$',
        timezone: 'America/Managua',
        receipt_format: '80mm',
        max_discount: 10,
      },
    },
  });
  expect(ticketSettings.status()).toBe(200);
  const ticketPdf = await page.request.get(pdfUrl!);
  const ticket = await PDFDocument.load(await ticketPdf.body());
  expect(ticket.getPage(0).getWidth()).toBe(226);
  const ticketPage = await page.context().newPage();
  await ticketPage.goto(
    (await dialog.getByRole('link', { name: 'Imprimir', exact: true }).getAttribute('href'))!,
  );
  await ticketPage.emulateMedia({ media: 'print' });
  await expect(ticketPage.locator('.receipt-80')).toBeVisible();
  await expect(ticketPage.getByText('Cliente: Cliente de prueba')).toBeVisible();
  expect(
    await ticketPage.locator('.receipt-80').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await ticketPage.screenshot({ path: 'test-results/print-80mm.png', fullPage: true });
  await ticketPage.close();
  await dialog.getByRole('button', { name: 'Cerrar ventana' }).click();
  await nav('Caja y bancos');
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Efectivo contado').fill('134');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Comprobante' })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Un buen día empieza en orden.' }),
    ).toBeVisible();
    await expect(page.locator('.metric').first()).toContainText('C$');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
    await page.goto('/?tab=sell');
    await expect(page.getByRole('heading', { name: 'Listos para vender.' })).toBeVisible();
    await expect(page.locator('.product-tile').first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/pos-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?tab=sell');
  await page.getByRole('button', { name: 'Agregar Tornillo galvanizado' }).click();
  await page.getByLabel('Importe pago 1').fill('2');
  const confirm = page.getByRole('button', { name: 'Confirmar venta', exact: true });
  await expect(confirm).toBeEnabled();
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Borrador guardado', exact: true })).toBeVisible();
  const savedDraft = await page.evaluate(
    () => Object.entries(sessionStorage).find(([key]) => key.includes('draft'))?.[1],
  );
  expect(savedDraft).toContain('Tornillo galvanizado');
  await page.context().setOffline(true);
  await expect(page.getByText(/Sin conexión/).first()).toBeVisible();
  await confirm.click();
  await expect(
    page.getByText(
      'Necesitas conexión para confirmar. Guarda el borrador y vuelve a intentar cuando tengas internet.',
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => Object.entries(sessionStorage).find(([key]) => key.includes('draft'))?.[1],
    ),
  ).toBe(savedDraft);
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});
