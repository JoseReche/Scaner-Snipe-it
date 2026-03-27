FROM node:20-alpine

WORKDIR /app

COPY src/package*.json ./
RUN npm ci --omit=dev

COPY src/ ./

EXPOSE 3000

CMD ["npm", "start"]
