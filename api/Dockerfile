
FROM node:20-alpine

#set working directory
WORKDIR /app

#copy only dependency files first (better caching)
COPY package.json package-lock.json ./

#Install dependencies
RUN npm install

#copy rest of the source code

COPY . .

#build NestJs app
RUN npm run build

#Expose API port
EXPOSE 3000

#Run compiled app
CMD ["npm", "run", "start:prod"]



