FROM node:24-alpine
WORKDIR /tracker
COPY backend/package*.json ./
RUN npm install && npm cache clean --force
COPY backend/ .
EXPOSE 3000
CMD ["node", "server.js"]