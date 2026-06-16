# Custom n8n image that bundles the `exceljs` library so the
# "Build Odoo File" Code node can generate styled, multi-tab .xlsx files.
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Install exceljs into a location the Code node can resolve.
RUN cd /usr/local/lib/node_modules/n8n && npm install exceljs --no-save

USER node
